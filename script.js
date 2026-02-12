/* ===== CONFIG ===== */
const SUPABASE_URL = "https://fqubarbjmryjoqfexuqz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImV4cCI6MjA4NjE0MDI2NX0.AnL_5uMC7gqIUGqexoiOM2mYFsxjZjVF21W-CUdTPBg";
const SECRET_PASS = "dada"; 
const WIPE_CODE = "808801"; 

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// PeerJS Variables
let myPeer;
let currentCall;

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
    const callBtn = document.getElementById("call-btn");

    let channel = null;
    let loggedIn = false;

    /* LOGIN LOGIC */
    loginBtn.onclick = async () => {
        const entered = passInput.value.trim().toLowerCase();
        if (entered !== SECRET_PASS.toLowerCase()) {
            alert("Wrong password");
            return;
        }
        loggedIn = true;
        authOverlay.style.display = "none";
        chatContainer.style.display = "flex";
        await loadMessages();
        initRealtime();
        initPeer(); // Start PeerJS after login
    };

    /* PEERJS INITIALIZATION */
    function initPeer() {
        // We use your existing senderId as the Peer ID
        myPeer = new Peer(senderId);

        myPeer.on('open', (id) => console.log('Peer ID:', id));

        // Handle Incoming Calls
        myPeer.on('call', async (call) => {
            if (confirm("Incoming Voice Call. Accept?")) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                call.answer(stream);
                call.on('stream', (remoteStream) => {
                    document.getElementById('remote-audio').srcObject = remoteStream;
                });
                currentCall = call;
            }
        });
    }

    /* REALTIME SYNC */
    function initRealtime() {
        if (channel) return;
        channel = client
            .channel("public-room")
            .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, 
            payload => {
                const msg = payload.new;
                
                // 1. Instant Wipe Logic
                if ((payload.eventType === "INSERT" && msg.content === WIPE_CODE) || payload.eventType === "DELETE") {
                    messagesBox.innerHTML = "";
                } 
                // 2. Incoming Call Signal Logic
                else if (payload.eventType === "INSERT" && msg.content === "SIGNAL_CALL_START" && msg.sender_id !== senderId) {
                    console.log("Peer signaling start call to:", msg.sender_id);
                    startVoiceCall(msg.sender_id);
                }
                // 3. Normal Message Logic
                else if (payload.eventType === "INSERT") {
                    renderMessage(msg);
                }
            })
            .subscribe();
    }

    async function startVoiceCall(targetId) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const call = myPeer.call(targetId, stream);
        call.on('stream', (remoteStream) => {
            document.getElementById('remote-audio').srcObject = remoteStream;
        });
        currentCall = call;
    }

    /* CALL BUTTON CLICK */
    callBtn.onclick = async () => {
        // Send a signal via Supabase to tell the other person to connect
        await client.from("messages").insert({ 
            content: "SIGNAL_CALL_START", 
            sender_id: senderId 
        });
        alert("Calling...");
    };

    /* LOAD HISTORY */
    async function loadMessages() {
        const { data, error } = await client.from("messages").select("*").order("created_at");
        if (error) return;
        messagesBox.innerHTML = "";
        if (data) {
            const isWiped = data.some(m => m.content === WIPE_CODE);
            if (!isWiped) {
                // Filter out signaling messages from history
                data.filter(m => m.content !== "SIGNAL_CALL_START").forEach(renderMessage);
            }
        }
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    /* RENDER MESSAGE */
    function renderMessage(msg) {
        if(msg.content === "SIGNAL_CALL_START") return; // Don't show call signals as text
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

        if (text === WIPE_CODE) {
            await client.from("messages").insert({ content: WIPE_CODE, sender_id: senderId });
            await client.from("messages").delete().neq("id", 0);
            messagesBox.innerHTML = "";
            msgInput.value = "";
            return;
        }

        const { error } = await client.from("messages").insert({ content: text, sender_id: senderId });

        if (!error) {
            msgInput.value = "";
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

    /* LOCK ON TAB HIDE */
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden || !loggedIn) return;
        loggedIn = false;
        messagesBox.innerHTML = "";
        chatContainer.style.display = "none";
        authOverlay.style.display = "flex";
        passInput.value = "";
        if (channel) { client.removeChannel(channel); channel = null; }
    });
};
