/* ===== CONFIG ===== */
const SUPABASE_URL = "https://fqubarbjmryjoqfexuqz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxdWJhcmJqbXJ5am9xZmV4dXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjQyNjUsImV4cCI6MjA4NjE0MDI2NX0.AnL_5uMC7gqIUGqexoiOM2mYFsxjZjVF21W-CUdTPBg";
const SECRET_PASS = "dada"; 
const WIPE_CODE = "808801"; 

// Initialize Client
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Wait for HTML to be ready so login/send buttons actually work
window.onload = () => {
    let senderId = localStorage.getItem("sender_id") || crypto.randomUUID();
    localStorage.setItem("sender_id", senderId);

    const authOverlay = document.getElementById("auth-overlay");
    const chatContainer = document.getElementById("chat-container");
    const passInput = document.getElementById("pass-input");
    const messagesBox = document.getElementById("messages");
    const msgInput = document.getElementById("msg-input");
    const loginBtn = document.getElementById("login-btn");
    const sendBtn = document.getElementById("send-btn");

    let channel = null;

    /* LOGIN LOGIC */
    loginBtn.onclick = async () => {
        const entered = passInput.value.trim().toLowerCase();
        if (entered !== SECRET_PASS.toLowerCase()) {
            alert("Wrong password");
            return;
        }
        authOverlay.style.display = "none";
        chatContainer.style.display = "flex";
        await loadMessages();
        initRealtime();
    };

    /* REALTIME SYNC (Wipe Signal + Delete Detection) */
    function initRealtime() {
        if (channel) return;
        channel = client
            .channel("public-room")
            .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, 
            payload => {
                // If a new message is the wipe code OR if a DELETE event happens
                if ((payload.eventType === "INSERT" && payload.new.content === WIPE_CODE) || payload.eventType === "DELETE") {
                    messagesBox.innerHTML = "";
                } else if (payload.eventType === "INSERT") {
                    renderMessage(payload.new);
                }
            })
            .subscribe();
    }

    /* LOAD HISTORY */
    async function loadMessages() {
        const { data, error } = await client.from("messages").select("*").order("created_at");
        if (error) {
            console.error("Supabase Error:", error.message);
            return;
        }
        messagesBox.innerHTML = "";
        if (data) {
            const isWiped = data.some(m => m.content === WIPE_CODE);
            if (!isWiped) {
                data.forEach(renderMessage);
            }
        }
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    /* RENDER MESSAGE */
    function renderMessage(msg) {
        const div = document.createElement("div");
        div.className = "msg " + (msg.sender_id === senderId ? "mine" : "theirs");
        div.textContent = msg.content;
        messagesBox.appendChild(div);
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    /* SEND MESSAGE */
    async function sendMessage() {
        const text = msgInput.value.trim();
        if (!text) return;

        // 🔥 THE WIPE TRIGGER
        if (text === WIPE_CODE) {
            // Send signal to others
            await client.from("messages").insert({ content: WIPE_CODE, sender_id: senderId });
            // Hard delete from DB
            await client.from("messages").delete().neq("id", 0);
            messagesBox.innerHTML = "";
            msgInput.value = "";
            return;
        }

        const { error } = await client.from("messages").insert({ 
            content: text, 
            sender_id: senderId 
        });

        if (error) {
            alert("Send Error: " + error.message);
        } else {
            msgInput.value = "";
            // Telegram Notification
            fetch(`${SUPABASE_URL}/functions/v1/dynamic-handler`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ text: "🔔 New message received!" })
            }).catch(e => console.log("Telegram silent."));
        }
    }

    sendBtn.onclick = sendMessage;
    msgInput.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };
};
