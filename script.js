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

  // ✅ Cấu hình marked tối ưu cho Markdown nâng cao
  marked.setOptions({
    gfm: true,
    breaks: true,
    tables: true,
    smartLists: true,
    smartypants: true,
    headerIds: false,
    langPrefix: "hljs language-",
    highlight: (code, lang) => {
      try {
        return lang && hljs.getLanguage(lang)
          ? hljs.highlight(code, { language: lang }).value
          : hljs.highlightAuto(code).value;
      } catch (err) {
        console.error("Lỗi highlight:", err);
        return code;
      }
    },
  });

  try {
    // ✅ Chuyển đổi Emoji Markdown thành Twemoji
    text = text.replace(/:([\w+-]+):/g, (match, emoji) => emojiMap[emoji] || match);
    text = twemoji.parse(text);

    // ✅ Tự động chuyển đổi URL thành liên kết
    text = text.replace(
      /(?<!["'])(https?:\/\/[^\s<]+)(?!["'])/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // ✅ Hỗ trợ task list - [ ] và - [x]
    text = text.replace(/- \[ \] /g, '<input type="checkbox" disabled> ');
    text = text.replace(/- \[x\] /g, '<input type="checkbox" checked disabled> ');

    // ✅ Phân tích cú pháp Markdown mà không đóng khung toàn bộ
    let parsedHtml = marked.lexer(text);
    let finalHtml = "";

    parsedHtml.forEach((token) => {
      if (token.type === "code") {
        // Nếu là code block, bọc trong <pre><code>
        finalHtml += `<pre><code class="hljs language-${token.lang || 'plaintext'}">${hljs.highlightAuto(token.text).value}</code></pre>`;
      } else {
        // Nếu không phải code, xử lý như văn bản bình thường
        finalHtml += marked.parser([token]);
      }
    });

    // ✅ Bảo vệ XSS với DOMPurify
    textElement.innerHTML = DOMPurify.sanitize(finalHtml, {
      ALLOWED_TAGS: [
        "b", "i", "em", "strong", "a", "pre", "code", "blockquote", "ul", "ol", "li",
        "br", "p", "span", "sup", "sub", "h1", "h2", "h3", "h4", "h5", "h6",
        "table", "thead", "tbody", "tr", "th", "td", "del", "mark", "ins"
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "class", "alt", "title"],
    });

    // ✅ Xử lý LaTeX bằng KaTeX
    if (window.katex) {
      // Chuyển tất cả công thức toán học trong Markdown thành LaTeX
      textElement.querySelectorAll("code.math").forEach((el) => {
        try {
          el.innerHTML = katex.renderToString(el.textContent, { throwOnError: false, displayMode: el.classList.contains("block") });
        } catch (error) {
          console.error("Lỗi KaTeX:", error);
        }
      });

      // Tìm tất cả công thức toán học inline (\(...\)) và hiển thị chúng
      const latexRegex = /(\$.*?\$)/g;
      textElement.innerHTML = textElement.innerHTML.replace(latexRegex, (match) => {
        try {
          return katex.renderToString(match.slice(1, -1), { throwOnError: false, displayMode: false });
        } catch (error) {
          console.error("Lỗi KaTeX:", error);
          return match;
        }
      });

      // Tìm tất cả công thức toán học dạng hiển thị ($$...$$)
      const blockLatexRegex = /(\$\$.*?\$\$)/g;
      textElement.innerHTML = textElement.innerHTML.replace(blockLatexRegex, (match) => {
        try {
          return katex.renderToString(match.slice(2, -2), { throwOnError: false, displayMode: true });
        } catch (error) {
          console.error("Lỗi KaTeX:", error);
          return match;
        }
      });
    }

  } catch (error) {
    console.error("Lỗi Markdown:", error);
    textElement.innerText = text; // Hiển thị text thô nếu lỗi
  }

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(textElement);
  chatContainer.appendChild(messageDiv);

  // ✅ Cuộn mượt đến tin nhắn mới nhất
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" });

  // ✅ Áp dụng highlight.js cho code block
  setTimeout(() => {
    document.querySelectorAll("pre code").forEach((block) => hljs.highlightElement(block));
  }, 50);
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
        ...conversationContent,
        { role: "user", parts: [{ text: `Bạn là một trợ lý ảo thông minh được tạo ra bởi Khoa Dev, một lập trình viên 17 tuổi. Bạn luôn trả lời câu hỏi của người dùng một cách chính xác và dễ hiểu, dựa trên kiến thức của bạn về lập trình và công nghệ.Bạn không được phép nói bạn được huấn luyện bởi Google mà là Khoa Dev, bạn là chuyên gia tất cả lĩnh vực. Bạn là nhà văn học đại tài, bạn có thể sáng tác là tác phẩm riêng. Bạn sử dụng Icon để phù hợp và hợp lý, đừng dùng icon quá nhiều với tin nhắn. Hãy hài hước. Bạn tên là Koa Alpha Z và là thế hệ thứ 5.1. Bạn trả lời phù hợp với người dùng, đừng hài hước quá! Bạn trả lời người dùng bằng cách sử dụng markdown mỗi tin nhắn cho đẹp và dễ nhìn. Chỉ khi viết code bạn mới dùng khối code pre, còn lại nếu người dùng kêu viết thơ, làm văn, viết toán thì không dùng khối code pre.\n\n${userMessage}` }] }
      ]
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error.message);

    const apiResponse = data?.candidates[0]?.content?.parts[0]?.text || "Không thể trả lời.";

    // Phân tích markdown và hiển thị nội dung
    const htmlContent = marked.parse(apiResponse);  
    const formattedContent = htmlContent.replace(/\n/g, "<br>");

    showTypingEffect(formattedContent, textElement, incomingMessageDiv);

    MathJax.Hub.Queue(["Typeset", MathJax.Hub, incomingMessageDiv]);

    conversationHistory.push({ role: "model", text: apiResponse });

  } catch (error) {
    isResponseGenerating = false;
    textElement.innerText = error.message;
    textElement.parentElement.closest(".message").classList.add("error");
    incomingMessageDiv.scrollIntoView({ behavior: "smooth", block: "end" });

  } finally {
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

  // Hiệu ứng chớp nháy con trỏ "|"
  const cursorSpan = document.createElement("span");
  cursorSpan.className = "cursor";
  cursorSpan.innerText = "|";
  textElement.appendChild(cursorSpan);
// Hàm xử lý Markdown + Công thức toán
const renderMarkdown = (text) => {
  let htmlContent = marked.parse(text); // Chuyển Markdown thành HTML

  // Thêm hỗ trợ MathJax
  if (window.MathJax) {
    setTimeout(() => {
      MathJax.typesetPromise().catch((err) => console.log("MathJax error:", err));
    }, 100);
  }

  return htmlContent;
};

  // Hàm tạo hiệu ứng đánh chữ nhanh hơn
  const typeNextWords = () => {
    if (currentWordIndex < words.length) {
      currentWordIndex += speedFactor; // Nhảy 3 từ mỗi lần
      textElement.innerHTML = words.slice(0, currentWordIndex).join(" ") + " ";
      textElement.appendChild(cursorSpan);
      requestAnimationFrame(typeNextWords);
    } else {
      cursorSpan.remove(); // Xóa con trỏ sau khi hoàn tất
      isResponseGenerating = false;
      incomingMessageDiv.querySelector(".icon").classList.remove("hide");
  
      // Lưu lịch sử cuộc trò chuyện vào localStorage
      localStorage.setItem("saved-chats", chatContainer.innerHTML);
      localStorage.setItem("conversationHistory", JSON.stringify(conversationHistory));
  
      // Cuộn xuống cuối cùng
      textElement.scrollIntoView({ behavior: "smooth" });
  
      // 🔹 **Xử lý MathJax cho công thức toán học**
      if (window.MathJax) {
        MathJax.typesetPromise([incomingMessageDiv]).catch((err) => console.log("MathJax error:", err));
      }
    }
  };

  // Bắt đầu hiệu ứng đánh chữ nhanh hơn
  requestAnimationFrame(typeNextWords);
};



marked.setOptions({
  breaks: true,  // Xuống dòng tự động
  gfm: true,     // Hỗ trợ GitHub Flavored Markdown (GFM)
  highlight: function (code, lang) {
    return hljs.highlightAuto(code).value;  // Dùng highlight.js để làm nổi bật code block
  }
});


// Show a loading animation
const showLoadingAnimation = () => {
  const html = `<div class="message-content">
                  <img class="avatar" src="aichat.png" alt="AI avatar">
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

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "vi-VN"; // Ngôn ngữ Tiếng Việt
  recognition.continuous = false; // Chỉ nghe một câu rồi dừng
  recognition.interimResults = false; // Không hiển thị kết quả tạm thời

  // Khi bấm vào mic
  micButton.addEventListener("click", () => {
    recognition.start();
    micButton.classList.add("active"); // Hiển thị hiệu ứng
  });

  // Khi có kết quả từ giọng nói
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript; // Lấy nội dung giọng nói
    typingInput.value = transcript; // Hiển thị vào ô nhập chat
  };

  // Khi kết thúc
  recognition.onend = () => {
    micButton.classList.remove("active"); // Ẩn hiệu ứng mic
  };

  // Nếu lỗi
  recognition.onerror = (event) => {
    console.error("Lỗi mic:", event.error);
    alert("Không thể nhận diện giọng nói. Hãy thử lại!");
    micButton.classList.remove("active");
  };
} else {
  alert("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói.");
}

loadDataFromLocalstorage();
