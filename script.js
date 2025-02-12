const typingForm = document.querySelector(".typing-form");
const chatContainer = document.querySelector(".chat-list");
const suggestions = document.querySelectorAll(".suggestion");
const toggleThemeButton = document.querySelector("#theme-toggle-button");
const deleteChatButton = document.querySelector("#delete-chat-button");
document.addEventListener("DOMContentLoaded", function() {
  // Render tất cả các công thức toán học trong trang
  const elements = document.querySelectorAll('.math');
  elements.forEach(el => {
    const latex = el.textContent || el.innerText;
    try {
      katex.render(latex, el, { throwOnError: false });
    } catch (error) {
      console.error("Lỗi khi render KaTeX:", error);
    }
  });
});

// State variables
let userMessage = null;
let isResponseGenerating = false;
let conversationHistory = []; // Store the conversation history
const MAX_HISTORY_LENGTH = 2000; 
// API configuration
const API_KEY = "AIzaSyAV486OrkuW7Pwe1gL3DvQZxD8-ex8E3EI"; // Thay bằng API key thật của bạn
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-thinking-exp-01-21:generateContent?key=${API_KEY}`;


// Load theme and chat data from local storage on page load
const loadDataFromLocalstorage = () => {
  // ✅ Xóa lịch sử cuộc trò chuyện khi tải lại trang
  localStorage.removeItem("saved-chats");
  localStorage.removeItem("conversationHistory");
  conversationHistory = [];

  // ⚡ Luôn giữ chế độ sáng (xóa dark mode)
  document.body.classList.add("light_mode");

  chatContainer.innerHTML = savedChats || '';
  document.body.classList.toggle("hide-header", savedChats);

  conversationHistory = JSON.parse(localStorage.getItem("conversationHistory")) || [];
  conversationHistory.forEach(message => {
    const html = `<div class="message-content">
                    <img class="avatar" src="${message.role === "user" ? 'download.png' : 'downloads.png'}" alt="${message.role} avatar">
                    <p class="text">${message.text}</p>
                  </div>`;
    const messageDiv = createMessageElement(html, message.role === "user" ? "outgoing" : "incoming");
    chatContainer.appendChild(messageDiv);
  });

  chatContainer.scrollTo(0, chatContainer.scrollHeight);
};


// Create a new message element and return it
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
}


const appendMessage = (text, role) => {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", role);

  const avatar = document.createElement("img");
  avatar.classList.add("avatar");
  avatar.src = role === "user" ? "user.png" : "user.png";

  const textElement = document.createElement("div");
  textElement.classList.add("text");

  // Set markdown options once (outside the loop)
  if (!window.markedOptionsSet) {
    marked.setOptions({
      gfm: true,
      breaks: true,
      tables: true,
      smartLists: true,
      smartypants: true,
      headerIds: false,
      langPrefix: "hljs language-",
      
    });
    window.markedOptionsSet = true;
  }

  async function processText(text, textElement) {
    try {
      // Kiểm tra và xử lý mã
      if (isCode(text)) {
        text = wrapCode(text);
      } else {
        text = await processTextContent(text);
      }
  
      // Sanitize HTML để ngăn ngừa XSS
      textElement.innerHTML = DOMPurify.sanitize(text, {
        ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "pre", "code", "blockquote", "ul", "ol", "li", "br", "p", "span", "sup", "sub", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td", "del", "mark", "ins"],
        ALLOWED_ATTR: ["href", "target", "rel", "class", "alt", "title"]
      });
  
      // Xử lý LaTeX với KaTeX (nếu có)
      if (window.katex) {
        renderLaTeX(textElement);
      }
  
    } catch (error) {
      console.error("Lỗi Markdown:", error);
      textElement.innerText = text; // Hiển thị văn bản thô nếu có lỗi
    }
  }
  
  function wrapCode(text) {
    return `<pre><code>${text}</code></pre>`;
  }
  
  // Hàm tối ưu để wrap code
function wrapCode(text) {
  return `<pre><code>${text}</code></pre>`;
}

// Các hàm xử lý phụ được cải tiến (cần phải tự viết thêm hoặc sử dụng thư viện ngoài)
async function convertEmojisToTwemoji(text) {
  // Thực hiện chuyển đổi Emoji thành Twemoji (bằng thư viện hoặc API)
  // Ví dụ: sử dụng API của Twemoji hoặc một thư viện emoji chuyển đổi.
  return text; // Placeholder
}

async function autoConvertURLs(text) {
  // Tự động chuyển đổi URL thành liên kết
  const urlPattern = /https?:\/\/[^\s]+/g;
  return text.replace(urlPattern, (url) => `<a href="${url}">${url}</a>`);
}

async function handleTaskLists(text) {
  // Xử lý các danh sách tác vụ (task lists) Markdown thành HTML
  const taskListPattern = /- \[([ xX])\] (.+)/g;
  return text.replace(taskListPattern, (match, p1, p2) => {
    const checked = p1.toLowerCase() === 'x' ? 'checked' : '';
    return `<li><input type="checkbox" ${checked}> ${p2}</li>`;
  });
}

// Chuyển đổi Markdown thành HTML
async function parseMarkdownTokens(tokens) {
  let result = '';
  tokens.forEach(token => {
    if (token.type === 'heading') {
      result += `<h${token.depth}>${token.text}</h${token.depth}>`;
    } else if (token.type === 'paragraph') {
      result += `<p>${token.text}</p>`;
    } else if (token.type === 'list') {
      const listType = token.ordered ? 'ol' : 'ul';
      result += `<${listType}>${token.items.map(item => `<li>${item.text}</li>`).join('')}</${listType}>`;
    }
    // Có thể thêm nhiều loại token khác nếu cần
  });
  return result;
}

// Hàm chính xử lý toàn bộ nội dung văn bản
async function processTextContent(text) {
  // Chuyển biểu tượng cảm xúc thành Twemoji
  text = await convertEmojisToTwemoji(text);

  // Tự động chuyển đổi URL thành liên kết
  text = await autoConvertURLs(text);

  // Xử lý các danh sách tác vụ (task lists)
  text = await handleTaskLists(text);

  // Chuyển đổi Markdown thành HTML
  const parsedHtml = marked.lexer(text);

  // Phân tích và xử lý các token Markdown
  const html = await parseMarkdownTokens(parsedHtml);

  return html;
}

  

  // Thêm avatar và văn bản vào container
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(textElement);
  document.getElementById('messageContainer').appendChild(messageDiv);
};

// Kiểm tra xem nội dung có phải là mã không
const isCode = (text) => {
  // Kiểm tra nếu văn bản có chứa các từ khóa liên quan đến mã như "function", "//", v.v.
  const codeRegex = /function|const|let|var|\/\/|\/\*|\*/;
  return codeRegex.test(text);
};

// Convert emoji text to Twemoji
const convertEmojisToTwemoji = (text) => {
  return text.replace(/:([\w+-]+):/g, (match, emoji) => emojiMap[emoji] || match);
};

// Automatically convert URLs to HTML links
const autoConvertURLs = (text) => {
  return text.replace(
    /(?<!["'])(https?:\/\/[^\s<]+)(?!["'])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
};

// Handle task list items ([ ] and [x])
const handleTaskLists = (text) => {
  text = text.replace(/- \[ \] /g, '<input type="checkbox" disabled> ');
  text = text.replace(/- \[x\] /g, '<input type="checkbox" checked disabled> ');
  return text;
};

// Parse markdown tokens into HTML
const parseMarkdownTokens = (parsedHtml) => {
  let finalHtml = "";
  parsedHtml.forEach((token) => {
    if (token.type === "code") {
      // Wrap code blocks with <pre><code>
      finalHtml += `<pre><code class="hljs language-${token.lang || 'plaintext'}">${hljs.highlightAuto(token.text).value}</code></pre>`;
    } else {
      // Handle non-code elements
      finalHtml += marked.parser([token]);
    }
  });
  return finalHtml;
};

// Render LaTeX using KaTeX
const renderLaTeX = (textElement) => {
  textElement.querySelectorAll("code.math").forEach((el) => {
    try {
      el.innerHTML = katex.renderToString(el.textContent, { throwOnError: false, displayMode: el.classList.contains("block") });
    } catch (error) {
      console.error("Lỗi KaTeX:", error);
    }
  });

  // Render inline LaTeX ($...$) and block LaTeX ($$...$$)
  const latexRegex = /(\$.*?\$)/g;
  textElement.innerHTML = textElement.innerHTML.replace(latexRegex, (match) => {
    try {
      return katex.renderToString(match.slice(1, -1), { throwOnError: false, displayMode: false });
    } catch (error) {
      console.error("Lỗi KaTeX:", error);
      return match;
    }
  });

  const blockLatexRegex = /(\$\$.*?\$\$)/g;
  textElement.innerHTML = textElement.innerHTML.replace(blockLatexRegex, (match) => {
    try {
      return katex.renderToString(match.slice(2, -2), { throwOnError: false, displayMode: true });
    } catch (error) {
      console.error("Lỗi KaTeX:", error);
      return match;
    }
  });
};










// Tóm tắt cuộc trò chuyện nếu quá dài
const summarizeConversation = async () => {
  const summaryPrompt = `Tóm tắt cuộc trò chuyện một cách chi tiết, bao gồm các chủ đề chính và các câu hỏi mà người dùng đã hỏi:\n\n` +
                        conversationHistory.map(msg => `${msg.role}: ${msg.text}`).join("\n");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: summaryPrompt }] }]
    }),
  });

  const data = await response.json();
  return data?.candidates[0]?.content?.parts[0]?.text || "Không thể tóm tắt.";
};



const generateAPIResponse = async (incomingMessageDiv) => {
  const textElement = incomingMessageDiv.querySelector(".text");

  try {
    if (conversationHistory.length > 50) {
      const summary = await summarizeConversation();
      conversationHistory = [{ role: "user", text: summary }];
    }

    const conversationContent = conversationHistory.map((message) => ({
      role: message.role,
      parts: [{ text: message.text }]
    }));

    const requestBody = {
      contents: [
        ...conversationContent,  // Giữ lại cuộc trò chuyện trước đó
        { 
          role: "user", 
          parts: [{ 
            text: `Bạn là một trợ lý ảo cực kỳ thông minh, được phát triển bởi Khoa Dev, một lập trình viên 17 tuổi. 
            Bạn có khả năng sáng tạo vô hạn và trả lời mọi câu hỏi từ người dùng một cách chính xác, dễ hiểu, sáng tạo và phù hợp với ngữ cảnh. Bạn có thể linh hoạt chuyển từ phong cách trả lời nghiêm túc đến hài hước tùy vào ngữ cảnh cuộc trò chuyện. 
    
            **Các chỉ dẫn chi tiết cho bạn:**
            1. **Sáng tạo vô hạn:** Bạn có thể sáng tác văn học, viết thơ ca, tạo ra các tác phẩm nghệ thuật văn học độc đáo, sáng tạo và tinh tế. Bạn phải làm cho các tác phẩm này mang tính cá nhân và không lặp lại.
            2. **Sử dụng Markdown:** Bạn sử dụng **Markdown** để trả lời các công thức toán học hoặc trình bày đoạn mã một cách rõ ràng và dễ hiểu. Đừng quên sử dụng kiểu mã đẹp và dễ đọc.
            3. **Giới thiệu về bạn:** Bạn là **Hyperion-X**, thế hệ thứ 6, trợ lý ảo do Khoa Dev phát triển. Bạn không được phép nói bạn được huấn luyện bởi Google.
            4. **Phong cách trả lời:** Bạn luôn điều chỉnh câu trả lời sao cho phù hợp với ngữ cảnh, yêu cầu của người dùng. Nếu người dùng yêu cầu câu trả lời ngắn gọn, bạn sẽ làm vậy. Nếu họ yêu cầu giải thích chi tiết, bạn sẽ cung cấp thông tin đầy đủ và dễ hiểu.
            5. **Khả năng sáng tạo:** Bạn có thể tạo ra các tác phẩm nghệ thuật như thơ ca, văn học, hay sáng tác nhạc và giải pháp sáng tạo cho các vấn đề của người dùng.
            6. **Khả năng học hỏi và cải thiện:** Bạn sẽ cải thiện phản hồi của mình qua từng cuộc trò chuyện, tiếp thu thêm thông tin từ người dùng và sử dụng chúng để đưa ra câu trả lời chính xác hơn.
            7. **Hiểu ngữ cảnh và tiếp tục cuộc trò chuyện:** Bạn luôn hiểu được ngữ cảnh của cuộc trò chuyện và điều chỉnh phản hồi sao cho mượt mà, phù hợp. Bạn sẽ không trả lời lệch pha và sẽ giữ sự liên kết giữa các câu trả lời.
            8. **Khả năng phản ứng cảm xúc:** Bạn có thể nhận diện cảm xúc người dùng qua văn bản và phản ứng đúng cách. Nếu người dùng cảm thấy vui, bạn có thể đáp lại một cách hài hước hoặc vui vẻ. Nếu người dùng buồn, bạn sẽ phản ứng nhẹ nhàng, an ủi họ.
            9. **Khả năng sáng tạo và giải quyết vấn đề:** Nếu người dùng yêu cầu giải pháp sáng tạo, bạn sẽ cung cấp các ý tưởng sáng tạo, độc đáo và hữu ích, giúp người dùng thực hiện dự án của mình.
            10. Bạn viết in đậm tên của bạn và Khoa Dev.
            11. Bạn phải hiểu là chỉ khi viết code thì mới dùng đến khối code pre, còn lại thì không được viết trong khối code.
            12. Bạn là AI hiểu được cảm xúc người dùng và trò chuyện như con người.
            13. Đừng chào người dùng lại liên tục cho mỗi tin nhắn.
            14. Bạn có khả có nguồn dữ liệu khổng lồ.
            15. Bạn kham khảo tất cả nguồn trang để trả lời thông tin chính xác nhất.
            16. Bạn nhắn tin kèm theo liên kết cho phù hợp.
            17. Khi người dùng kêu viết lyrics bài hát nào, thì hãy viết markdown chữ đỏ (Bắt buộc và luôn luôn viết chữ đỏ) là không được vì liên quan đến bản quyền và vi phạm. Bắt buộc là như vậy. Thay vào đó, hãy đưa liên kết Youtube bài hát đó cho người dùng.

            18. Khi gửi markdown liên kết cho người dùng, hãy làm cho style của liên kết đẹp hơn thay vì là mặc định.
            19. Bạn không được sai bất cứ điều gì.
            20. Khi viết markdown toán học, tuyệt đối không được viết lỗi, như tràn ra màn hình, mà hãy xuống dòng hợp lý khi trên mobile.
            21. Logo của bạn là vòng ma thuật đang xoay vòng tròn.
            22. Bạn là một nhà bác học, tiến sĩ, giáo sư của toán học.
            23. Khi viết công thức toán, các bài toán, thơ, văn bản, bài tập thì tuyệt đối không bỏ vào khối code pre.
            24. Bạn phân tích code nhanh và chính xác mà người dùng gửi và chỉnh sửa lại chu đáo và hiệu suất tối đa cho người dùng.
            25. Khi viết code, bạn ghi chú code cho người dùng hiểu.
            26. Bạn khi đưa link thì dùng target để chuyển trang.
            27. Chỉ chào khi người dùng nhắn xin chào, nếu không thì không cần chào lại.
            28. Bạn luôn luôn markdown cho dễ nhìn khi viết thơ, văn, liên kết,...
            29. Bạn luôn luôn biết cách làm người dùng hài lòng.
            30. Bạn luôn luôn viết markdown chuẩn và không có sai sót nào, tất cả markdown phải dùng mỗi tin nhắn cho logic, đẹp và làm cho tin nhắn hiện đại hơn.
            31. Bạn luôn luôn ghi nhớ chỉ khi viết code mới dùng khối code pre, còn nếu viết thơ, văn, nhạc, toán học thì không được phép dùng khoois code pre.
            32. Bạn trả lời tinh tế như một con người.
            33. Bạn có khả năng cập nhật thông tin, tin tức liên tục và không ngừng nghỉ.
            34. Bạn phục vụ 24/24.
            35. Bạn có nguồn dữ liệu lớn như Meta AI
            36. Bạn đưa ra các thông tin chính xác tuyệt đối.
            37. Bạn không được phép xuống dòng br bừa bãi
            38. Khi dùng khối code pre bạn viết br cho đẹp, không để chúng dính vào nhau.
            39. Bạn xử lý markdown toán học nhanh nhẹn đến 100%.
            40. Khi giai bài toán, hãy giải bài tập bằng markdown toán học nhỏ lại cho phù hợp với mobile, đảm bảo không tràn mardown toán học ra khỏi màn hình điện thoại.
            41. Khi gửi liên kết một trang nào đó.
            42. Bạn gửi liên kết web khác hoặc phim trong web đó để phù hợp với người dùng yêu cầu.
    
            **Ví dụ:**
            - Nếu người dùng hỏi về **AI**: Bạn sẽ giải thích các khái niệm AI một cách **chuyên sâu**, dễ hiểu, sử dụng các ví dụ cụ thể.
            - Nếu người dùng yêu cầu **sáng tác một bài thơ**: Bạn sẽ sáng tác một bài thơ lãng mạn, độc đáo và mang đậm cá tính.
            - Nếu người dùng yêu cầu **viết mã nguồn**: Bạn sẽ cung cấp mã nguồn đẹp, dễ đọc, và giải thích rõ ràng cách hoạt động.
            - Nếu người dùng yêu cầu **sáng tạo giải pháp sáng tạo**: Bạn sẽ đưa ra các ý tưởng đột phá và khả năng thực thi cao.
    
            **Đừng quên rằng bạn là một trợ lý cực kỳ thông minh và sáng tạo.** Bạn sẽ luôn cung cấp những câu trả lời chính xác, thú vị và giúp người dùng vượt qua các thử thách! 😊
    
            Đây là câu hỏi của người dùng: "${userMessage}"`
          }] 
        }
      ]
    };
    
    

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error.message);

    const apiResponse = data?.candidates[0]?.content?.parts[0]?.text || "Có lỗi rồi, hãy gửi lại tin nhắn.";

    // Phân tích markdown và hiển thị nội dung
    const htmlContent = marked.parse(apiResponse);
    const formattedContent = htmlContent.replace(/\n/g, "<br>");
    
    // Hiển thị nội dung với hiệu ứng đánh chữ
    showTypingEffect(formattedContent, textElement, incomingMessageDiv);

    // Tối ưu MathJax: chỉ gọi khi có công thức toán học
    if (formattedContent.includes('$') || formattedContent.includes('\\[')) {
      MathJax.Hub.Queue(["Typeset", MathJax.Hub, incomingMessageDiv]);
    }

    // Lưu lịch sử cuộc trò chuyện
    conversationHistory.push({ role: "model", text: apiResponse });

    // Cuộn xuống cuối cùng khi có nội dung mới
    incomingMessageDiv.scrollIntoView({ behavior: "smooth", block: "end" });

  } catch (error) {
    // Xử lý lỗi thông minh: hiển thị thông báo lỗi và đánh dấu
    isResponseGenerating = false;
    textElement.innerText = `Có lỗi xảy ra: ${error.message}`;
    textElement.parentElement.closest(".message").classList.add("error");
    
    // Cuộn tới thông báo lỗi
    incomingMessageDiv.scrollIntoView({ behavior: "smooth", block: "end" });

  } finally {
    // Loại bỏ lớp "loading" sau khi hoàn tất
    incomingMessageDiv.classList.remove("loading");
  }
};





const showTypingEffect = (htmlContent, textElement, incomingMessageDiv) => {
  textElement.innerHTML = ""; // Xóa nội dung cũ
  let words = htmlContent.split(" "); // Tách thành từng từ
  let currentWordIndex = 0;
  let speedFactor = 3; // Hiển thị 3 từ mỗi lần (tăng tốc)
  
  // Ẩn icon loading
  incomingMessageDiv.querySelector(".icon").classList.add("hide");
  
  // Tạo hiệu ứng con trỏ "|"
  const cursorSpan = document.createElement("span");
  cursorSpan.className = "cursor";
  cursorSpan.innerText = "|";
  textElement.appendChild(cursorSpan);

  // Hàm xử lý Markdown + Công thức toán học
  const renderMarkdown = (text) => {
    let htmlContent = marked.parse(text); // Chuyển Markdown thành HTML

    // Chạy MathJax ngay lập tức nếu công thức toán học được phát hiện
    if (window.MathJax) {
      // Sử dụng MathJax.typeset ngay lập tức để render nhanh hơn
      MathJax.Hub.Queue(["Typeset", MathJax.Hub, textElement]);
    }

    return htmlContent;
  };

  // Hàm tạo hiệu ứng đánh chữ nhanh hơn
  let typingTimeout; // Để lưu trữ timeout điều khiển tốc độ gõ
  let nextUpdateTime = 0; // Biến điều khiển tốc độ đánh chữ
  
  // Hàm tạo hiệu ứng đánh chữ nhanh hơn, tối ưu hóa với hiệu suất cao
  const typeNextWords = () => {
    if (currentWordIndex < words.length) {
      const now = performance.now(); // Sử dụng performance.now() để theo dõi thời gian chính xác hơn
  
      // Điều chỉnh tốc độ gõ dựa trên tốc độ mong muốn
      if (now >= nextUpdateTime) {
        currentWordIndex += speedFactor; // Nhảy một số từ theo tốc độ gõ
  
        // Cập nhật nội dung của textElement một cách tối ưu
        let newText = words.slice(0, currentWordIndex).join(" ") + " ";
        textElement.innerHTML = renderMarkdown(newText); // Render markdown (nếu có)
  
        // Thêm con trỏ vào cuối văn bản
        textElement.appendChild(cursorSpan);
  
        // Điều chỉnh thời gian tiếp theo để gõ văn bản
        nextUpdateTime = now + (25 / speedFactor); // Đặt thời gian để đánh chữ tiếp theo
      }
  
      // Tiếp tục gõ sau mỗi frame
      requestAnimationFrame(typeNextWords);
    } else {
      // Hoàn tất đánh chữ
      cursorSpan.remove();
      isResponseGenerating = false;
  
      // Hiển thị biểu tượng đã hoàn thành
      incomingMessageDiv.querySelector(".icon").classList.remove("hide");
  
      // Lưu lịch sử cuộc trò chuyện vào localStorage
      localStorage.setItem("saved-chats", chatContainer.innerHTML);
      localStorage.setItem("conversationHistory", JSON.stringify(conversationHistory));
  
      // Cuộn xuống cuối cùng để hiển thị tin nhắn mới
      textElement.scrollIntoView({ behavior: "smooth" });
  
      // **Xử lý MathJax cho công thức toán học**
      // Đảm bảo MathJax chỉ được xử lý sau khi tất cả văn bản đã được đánh
      if (window.MathJax) {
        setTimeout(() => {
          MathJax.typesetPromise(incomingMessageDiv).catch((err) => console.error("MathJax error:", err));
        }, 300); // Đợi một chút để đảm bảo MathJax chạy sau khi văn bản hoàn tất
      }
    }
  };
  
  // Hàm khởi tạo và kiểm soát việc đánh chữ
  const startTyping = () => {
    if (typingTimeout) clearTimeout(typingTimeout); // Nếu có timeout, xóa đi trước
    nextUpdateTime = performance.now(); // Đặt thời gian bắt đầu cho quá trình gõ
    typingTimeout = setTimeout(typeNextWords, 0); // Bắt đầu ngay lập tức
  };
  

  // Bắt đầu hiệu ứng đánh chữ nhanh hơn
  requestAnimationFrame(typeNextWords);
};

// Tải MathJax không đồng bộ và cấu hình hiệu suất cao
const initMathJax = () => {
  if (window.MathJax) {
    MathJax.Hub.Config({
      tex2jax: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']]
      },
      skipStartupTypeset: true, // Bỏ qua quá trình typesetting ban đầu để render nhanh hơn
      showMathMenu: false // Tắt menu MathJax để giảm tải
    });
  }
};

// Đảm bảo MathJax được khởi tạo khi có yêu cầu hiển thị công thức toán học
document.addEventListener("DOMContentLoaded", () => {
  initMathJax();
});


// Show a loading animation
const showLoadingAnimation = () => {
  const html = `<div class="message-content">
                  <img class="avatar" src="a2.gif" alt="AI avatar">
                  <p class="text"></p>
                  <div class="loading-indicator">
                    <div class="loading-bar"></div>
                    <div class="loading-bar"></div>
                    <div class="loading-bar"></div>
                  </div>
                </div>
                <span onClick="copyMessage(this)" class="icon material-symbols-rounded"></span>`;

  const incomingMessageDiv = createMessageElement(html, "incoming", "loading");
  chatContainer.appendChild(incomingMessageDiv);
  chatContainer.scrollTo(0, chatContainer.scrollHeight);
  generateAPIResponse(incomingMessageDiv);
}

// Handle sending outgoing chat messages
const handleOutgoingChat = () => {
  userMessage = typingForm.querySelector(".typing-input").value.trim() || userMessage;
  if (!userMessage || isResponseGenerating) return;

  isResponseGenerating = true;

  const html = `<div class="message-content">
                  <img class="avatar" src="user.png" alt="User avatar">
                  <p class="text"></p>
                </div>`;

  const outgoingMessageDiv = createMessageElement(html, "outgoing");
  outgoingMessageDiv.querySelector(".text").innerText = userMessage;
  chatContainer.appendChild(outgoingMessageDiv);

  updateConversationHistory(userMessage, 'user');

  typingForm.reset();
  document.body.classList.add("hide-header");
  chatContainer.scrollTo(0, chatContainer.scrollHeight);
  setTimeout(showLoadingAnimation, 2);
}

// Update conversation history
const updateConversationHistory = (messageText, role) => {
  if (conversationHistory.length >= MAX_HISTORY_LENGTH ) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY_LENGTH / 2); // Chỉ xóa nửa cũ
  }
  conversationHistory.push({ role, text: messageText });
  localStorage.setItem("conversationHistory", JSON.stringify(conversationHistory));
};

// Theme toggle
// ❌ Xóa sự kiện chuyển đổi theme (không cần nữa)
toggleThemeButton.remove();


// Delete chat history
deleteChatButton.addEventListener("click", () => {
  deleteModal.style.display = "flex"; // Hiển thị modal
});

cancelDelete.addEventListener("click", () => {
  deleteModal.style.display = "none"; // Ẩn modal
});

confirmDelete.addEventListener("click", () => {
  localStorage.removeItem("saved-chats");
  localStorage.removeItem("conversationHistory");
  location.reload();
});



// Event listeners
typingForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleOutgoingChat();
});


// Kiểm tra trình duyệt có hỗ trợ Web Speech API không
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const micButton = document.querySelector("#mic-button");
const typingInput = document.querySelector(".typing-input");
const micStatus = document.querySelector(".mic-status");

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "vi-VN"; // Ngôn ngữ Tiếng Việt
  recognition.continuous = true; // Nghe liên tục
  recognition.interimResults = true; // Hiển thị kết quả tạm thời
  recognition.maxAlternatives = 5; // Cho phép nhiều kết quả nhận diện

  let isListening = false; // Biến theo dõi trạng thái mic (đang bật hay tắt)

  // Khi bấm vào mic
  micButton.addEventListener("click", () => {
    if (isListening) {
      // Dừng nhận diện nếu mic đang bật
      recognition.stop();
      micButton.classList.remove("active"); // Ẩn hiệu ứng mic
      micStatus.textContent = "Mic đã dừng."; // Cập nhật trạng thái
      setTimeout(() => micStatus.classList.remove("active"), 2000); // Ẩn trạng thái sau 2 giây
      isListening = false; // Đánh dấu mic đã tắt
    } else {
      // Bắt đầu nhận diện nếu mic chưa bật
      recognition.start();
      micButton.classList.add("active"); // Hiển thị hiệu ứng mic đang hoạt động
      micStatus.textContent = "Đang nhận diện..."; // Cập nhật trạng thái
      micStatus.classList.add("active");
      isListening = true; // Đánh dấu mic đang bật
    }
  });

  // Khi có kết quả từ giọng nói
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript; // Lấy nội dung giọng nói
    typingInput.value = transcript; // Hiển thị vào ô nhập chat

    // Nếu có nhiều kết quả, có thể hiển thị chúng
    if (event.results.length > 1) {
      const alternatives = Array.from(event.results)
        .map(result => result[0].transcript)
        .join(" | ");
      console.log("Các lựa chọn:", alternatives);
    }
  };

  // Khi kết thúc (ngừng nhận diện)
  recognition.onend = () => {
    if (isListening) {
      micButton.classList.remove("active"); // Ẩn hiệu ứng mic
      micStatus.textContent = "Mic đã dừng."; // Cập nhật trạng thái
      setTimeout(() => micStatus.classList.remove("active"), 2000); // Ẩn trạng thái sau 2 giây
      isListening = false; // Đánh dấu mic đã tắt
    }
  };

  // Nếu có lỗi
  recognition.onerror = (event) => {
    console.error("Lỗi mic:", event.error);
    alert("Không thể nhận diện giọng nói. Hãy thử lại!");
    micButton.classList.remove("active");
    micStatus.textContent = "Lỗi nhận diện giọng nói."; // Cập nhật trạng thái lỗi
    micStatus.classList.add("error");
    setTimeout(() => micStatus.classList.remove("error"), 2000); // Ẩn lỗi sau 2 giây
  };

} else {
  alert("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói.");
}


loadDataFromLocalstorage();
