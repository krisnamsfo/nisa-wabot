const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const os = require('os');
const fs = require('fs'); 
const path = require('path'); 

let sock = null;

// =========================================================================
// SINKRONISASI KONFIGURASI DARI DATABASE.JSON
// =========================================================================
const dbPath = path.join(__dirname, '../database.json'); 
let NODE_BOT_NUMBER = '6281333148055'; // Nilai cadangan (fallback)

function getConfig() {
    try {
        if (fs.existsSync(dbPath)) {
            const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
            return dbData.config || {};
        }
    } catch (e) {
        console.error(' Gagal membaca database.json:', e.message);
    }
    return {};
}

// Memperbarui variabel NODE_BOT_NUMBER dari database.json secara dinamis saat file dimuat
const currentConfig = getConfig();
if (currentConfig.botId) {
    NODE_BOT_NUMBER = currentConfig.botId.split('@')[0];
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d > 0 ? `${d} Hari, ` : ""}${h > 0 ? `${h} Jam, ` : ""}${m > 0 ? `${m} Menit, ` : ""}${s} Detik`;
}

function bytesToGB(bytes) { return (bytes / (1024 * 1024 * 1024)).toFixed(2); }

async function initWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false
    });

    if (!sock.authState.creds.registered) {
        console.log(`[WA] Mencoba mendaftarkan nomor: ${NODE_BOT_NUMBER} via Pairing Code...`);
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(NODE_BOT_NUMBER);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`\n PAIRING CODE ANDA: ${code}\n`);
            } catch (error) { console.error('[WA] Gagal meminta pairing code:', error.message); }
        }, 6000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) { setTimeout(() => { initWhatsApp(); }, 5000); }
        } else if (connection === 'open') { 
            console.log('[WA] WhatsApp Bot SIAP BEROPERASI!'); 
            console.log(' INFO BOT SAYA:');
            console.log(sock.user);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        let from = msg.key.remoteJid;
        if (!from) return;
        from = from.replace(/:\d+/, ''); 

        const body = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || 
                     msg.message?.imageMessage?.caption || 
                     msg.message?.viewOnceMessageV2?.message?.imageMessage?.caption ||
                     msg.message?.viewOnceMessageV2?.message?.extendedTextMessage?.text || 
                     "";

        if (!body.trim()) return;
        
        // Memecah argumen dasar (Menggunakan body asli agar huruf besar-kecil terjaga)
        const argsRaw = body.trim().split(/ +/).slice(1);
        const command = body.trim().split(/ +/)[0].toLowerCase();

        // =========================================================================
        // LOG COMMAND MASUK (Versi Aman & Anti Error Loop)
        // =========================================================================
        if (msg.message && (command.startsWith('.') || command.startsWith('!'))) {
            const idPengirim = msg.key.participant || msg.key.remoteJid;
            const cekGrup = msg.key.remoteJid.endsWith('@g.us') ? 'Ya (Grup)' : 'Tidak (Private Chat)';

            console.log('\n====================================');
            console.log(` [COMMAND MASUK]`);
            console.log(` ID Pengirim : ${idPengirim}`);
            console.log(` Perintah    : ${command}`);
            console.log(` Di Grup?    : ${cekGrup}`);
            console.log('====================================\n');

            // Proteksi: Abaikan jika perintah ini dikirim oleh botId itu sendiri
            if (idPengirim === getConfig().botId) return;
        }

// AWALL

        // =========================================================================
        // COMMAND: .menu (PANDUAN UTAMA TEKNISI - INJECT UNICODE EMOJI)
        // =========================================================================
        if (command === '.menu' || command === '.help') {
            // Kita deklarasikan emoji menggunakan kode hexadecimal murni
            const emjRoket  = String.fromCodePoint(0x1F680); // 
            const emjHp     = String.fromCodePoint(0x1F4F1); // 
            const emjMerah  = String.fromCodePoint(0x1F534); // 
            const emjBiru   = String.fromCodePoint(0x1F539); // 
            const emjSirine = String.fromCodePoint(0x1F6A8); // 
            const emjPin    = String.fromCodePoint(0x1F4CC); // 
            const emjGear   = String.fromCodePoint(0x2699);  // 
            const emjGrafik = String.fromCodePoint(0x1F4CA); // 

            let menuTeks = `${emjRoket} *NISA SEMARANG MONITORING* ${emjRoket}\n`;
            menuTeks += `\n\n`;
            
            menuTeks += `${emjMerah} *MONITORING FAT LOSS (Semarang)*\n`;
            menuTeks += `${emjBiru} \`.nisa\` : Cek seluruh tiket FT status OPEN\n`;
            menuTeks += `${emjBiru} \`.nisadone\` : Cek riwayat penanganan tiket FT DONE\n`;
            menuTeks += `${emjBiru} \`.cektiket [No_FT]\` : Bongkar data internal pelanggan\n`;
            menuTeks += `${emjBiru} \`.cekfat [No_FT]\` : Real-time Mass Ping ONT di FAT\n\n`;

            menuTeks += `${emjSirine} *GAMAS MONITORING (Mass Problem)*\n`;
            menuTeks += `${emjBiru} \`.olt\` / \`.gamasolt\` : Monitoring Gamas OLT Open (Global)\n`;
            menuTeks += `${emjBiru} \`.oltsmg\` : Monitoring Gamas OLT (Khusus Semarang)\n`;
            menuTeks += `${emjBiru} \`.cekmp [No_MP]\` : Bongkar port OLT & dampak cluster\n\n`;

            menuTeks += `${emjPin} *PRE-MP MONITORING (Early Warning)*\n`;
            menuTeks += `${emjBiru} \`.preopen\` : Database indikasi awal gangguan (All Region)\n`;
            menuTeks += `${emjBiru} \`.cekhost [ID_Tmas]\` : Bongkar port & posisi frame/slot OLT\n\n`;

            menuTeks += `${emjGear} *SYSTEM AUTOMATION & UTILITY*\n`;
            menuTeks += `${emjBiru} \`.idchat\` : Ambil ID unik grup / chat ini\n`;
            menuTeks += `${emjBiru} \`.uptime\` : Cek durasi aktif server VPS\n`;
            menuTeks += `${emjBiru} \`.vps\` : Cek spesifikasi hardware & RAM VPS\n`;
            menuTeks += `${emjBiru} \`.updtoken [token]\` : Inject Token NISA (Owner Only)\n\n`;

            menuTeks += `${emjGrafik} *SERVER STATUS:* \`ONLINE\`\n`;
            menuTeks += `\n`;
            menuTeks += ` _*Tips:* Ketik perintah persis seperti contoh. Jangan lupa gunakan tanda titik (.) di awal command._`;

            return await sock.sendMessage(from, { text: menuTeks }, { quoted: msg });
        }

    

// Batas 

    
        // 1. COMMAND: .idchat
        if (command === '.idchat') {
            const isGroup = from.endsWith('@g.us');
            const teksId = ` *INFO ID CHAT*\n\n *ID Saat Ini:* \`${from}\`\n *Tipe Chat:* ${isGroup ? 'Grup' : 'Private Chat'}\n\n_Silakan salin ID di atas untuk dimasukkan ke database manual._`;
            return await sock.sendMessage(from, { text: teksId }, { quoted: msg });
        }

        // 2. COMMAND: .uptime
        if (command === '.uptime') {
            const responUptime = `* VPS UPTIME STATUS *\n\n *Uptime:* ${formatUptime(os.uptime())}\n *Waktu Server:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
            await sock.sendMessage(from, { text: responUptime }, { quoted: msg });
        }

        // 3. COMMAND: .vps
        else if (command === '.vps') {
            const infoVPS = `* VPS HARDWARE SPEC *\n\n *CPU Core:* ${os.cpus().length}\n *RAM:* ${bytesToGB(os.totalmem() - os.freemem())} GB / ${bytesToGB(os.totalmem())} GB\n *OS:* ${os.platform()}`;
            await sock.sendMessage(from, { text: infoVPS }, { quoted: msg });
        }

        // 4. COMMAND: .nisa
        else if (command === '.nisa') {
            await sock.sendMessage(from, { text: ' Sedang mengumpulkan data dari Portal NISA, mohon tunggu...' }, { quoted: msg });
            try {
                const { scrapeNisa } = require('../scrapers/nisaScraper');
                const hasilScrape = await scrapeNisa(process.env.NISA_USER, process.env.NISA_PASSWORD);
                await sock.sendMessage(from, { text: hasilScrape.data }, { quoted: msg });
            } catch (err) { await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); }
        }

        // 4b. COMMAND: .nisadone
        else if (command === '.nisadone') {
            await sock.sendMessage(from, { text: ' Menghubungi API NISA untuk menarik riwayat tiket Fat Loss DONE, mohon tunggu...' }, { quoted: msg });
            try {
                const { scrapeFatLossDone } = require('../scrapers/nisaScraper');
                const hasilFatDone = await scrapeFatLossDone();
                
                if (hasilFatDone.success) {
                    await sock.sendMessage(from, { text: hasilFatDone.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Gagal:* ${hasilFatDone.error}` }, { quoted: msg });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg });
            }
        }

        // COMMAND BARU: .updtoken [token]
        else if (command === '.updtoken') {
            const config = getConfig();
            const nomorOwner = config.ownerId; 
            const idPengirim = msg.key.participant || msg.key.remoteJid;

            if (idPengirim !== nomorOwner) {
                await sock.sendMessage(from, { text: ' Perintah ini ilegal dan hanya dapat dijalankan oleh Owner Bot.' }, { quoted: msg });
                return;
            }

            const tokenBaru = argsRaw.join(' ').trim();
            if (!tokenBaru) {
                await sock.sendMessage(from, { text: ' Format salah!\n\nCara penggunaan:\n`.updtoken eyJhbGciOiJIUzI1Ni...`' }, { quoted: msg });
                return;
            }

            if (!tokenBaru.startsWith('eyJ')) {
                await sock.sendMessage(from, { text: ' Token tidak valid! Token NISA biasanya diawali dengan karakter `eyJ...`' }, { quoted: msg });
                return;
            }

            try {
                const envPath = path.join(__dirname, '../.env'); 
                if (!fs.existsSync(envPath)) {
                    await sock.sendMessage(from, { text: ' File `.env` tidak ditemukan di direktori bot.' }, { quoted: msg });
                    return;
                }

                let envContent = fs.readFileSync(envPath, 'utf-8');
                if (envContent.includes('NISA_TOKEN=')) {
                    envContent = envContent.replace(/NISA_TOKEN=.*/, `NISA_TOKEN=${tokenBaru}`);
                } else {
                    envContent += `\nNISA_TOKEN=${tokenBaru}`;
                }

                fs.writeFileSync(envPath, envContent, 'utf-8');
                process.env.NISA_TOKEN = tokenBaru; 

                const tokenSnippet = tokenBaru.substring(0, 15) + '...' + tokenBaru.substring(tokenBaru.length - 15);
                let pesanSukses = ` *TOKEN NISA BERHASIL DIPERBARUI!*\n\n`;
                pesanSukses += ` *Token:* \`${tokenSnippet}\`\n\n`;
                pesanSukses += `_Sistem telah menerapkan token baru secara live. Anda bisa langsung mencoba perintah \`.olt\` sekarang tanpa perlu restart bot!_`;

                await sock.sendMessage(from, { text: pesanSukses }, { quoted: msg });
            } catch (error) {
                await sock.sendMessage(from, { text: ` Gagal memperbarui token secara sistem: ${error.message}` }, { quoted: msg });
            }
        }

        // 5. COMMAND: .cektiket [No Tiket FT]
        else if (command === '.cektiket') {
            const inputTiket = argsRaw[0];
            if (!inputTiket) return await sock.sendMessage(from, { text: ' *Format Salah!*\nContoh: *\.cektiket FT260600316*' }, { quoted: msg });

            await sock.sendMessage(from, { text: ` Sedang membongkar data pelanggan untuk *${inputTiket}*, mohon tunggu...` }, { quoted: msg });
            try {
                const { cekDetailTiket } = require('../scrapers/nisaScraper');
                const hasilDetail = await cekDetailTiket(inputTiket);
                
                if (hasilDetail.success) {
                    await sock.sendMessage(from, { text: hasilDetail.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Gagal:* ${hasilDetail.error}` }, { quoted: msg });
                }
                
            } catch (err) { await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); }
        }

                   // =========================================================================
        // 6. COMMAND: .cekfat [No Tiket FT] (VERSI FIX + LOG TERMINAL)
        // =========================================================================
        else if (command === '.cekfat') {
            const inputTiket = argsRaw[0];
            if (!inputTiket) return await sock.sendMessage(from, { text: ' *Format Salah!*\nContoh: *\.cekfat FT260600316*' }, { quoted: msg });

            await sock.sendMessage(from, { text: ` Melakukan Real-time Ping ONT massal untuk tiket *${inputTiket}*, mohon tunggu beberapa saat...` }, { quoted: msg });
            
            console.log(`[${new Date().toLocaleTimeString('id-ID')}]  [.cekfat] Memulai proses Ping Massal untuk tiket: ${inputTiket}`);

            try {
                const { cekStatusFat } = require('../scrapers/nisaScraper');
                const hasilFat = await cekStatusFat(inputTiket);
                
                if (hasilFat.success) {
                    // LOG BERHASIL DI TERMINAL
                    console.log(`[${new Date().toLocaleTimeString('id-ID')}]  [.cekfat] BERHASIL! Data ping untuk ${inputTiket} terkirim ke WhatsApp.`);
                    await sock.sendMessage(from, { text: hasilFat.data }, { quoted: msg });
                } else {
                    // LOG GAGAL DI TERMINAL (RESPON DARI API)
                    console.error(`[${new Date().toLocaleTimeString('id-ID')}]  [.cekfat] GAGAL! Respon API NISA: ${hasilFat.error}`);

                    if (hasilFat.error && (hasilFat.error.includes('504') || hasilFat.error.includes('timeout'))) {
                        let pesanTimeout = ` *PORTAL NISA TIMEOUT (504)* \n\n`;
                        pesanTimeout += `Sistem gagal melakukan ping massal pada tiket *${inputTiket}* karena server NISA merespons terlalu lama.\n\n`;
                        await sock.sendMessage(from, { text: pesanTimeout }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: ` *Gagal:* ${hasilFat.error}` }, { quoted: msg });
                    }
                }
                
            } catch (err) { 
                // LOG EROR FATAL DI TERMINAL (SYSTEM SYSTEM/CRASH)
                console.error(`[${new Date().toLocaleTimeString('id-ID')}]  [.cekfat] CRITICAL ERROR: ${err.message}`);

                if (err.message.includes('504')) {
                    await sock.sendMessage(from, { text: ` *Portal NISA Busy (504):* Server sedang sibuk memproses ping massal. Silakan coba sesaat lagi.` }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); 
                }
            }
        }




        // 7. COMMAND: .olt / .gamasolt
        else if (command === '.olt' || command === '.gamasolt') {
            await sock.sendMessage(from, { text: ' Sedang menarik monitoring gangguan OLT secara real-time dari NISA...' }, { quoted: msg });
            try {
                const { scrapeGamasOlt } = require('../scrapers/nisaScraper');
                const hasilOlt = await scrapeGamasOlt();
                
                if (hasilOlt.success) {
                    await sock.sendMessage(from, { text: hasilOlt.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Gagal:* ${hasilOlt.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }

        // 8. COMMAND: .oltsmg (KHUSUS MONITORING AREA SEMARANG)
        else if (command === '.oltsmg') {
            await sock.sendMessage(from, { text: ' Sedang mengecek database MP Open khusus Area Semarang...' }, { quoted: msg });
            try {
                const { scrapeGamasSemarang } = require('../scrapers/nisaScraper');
                const hasilSemarang = await scrapeGamasSemarang(process.env.NISA_USER, process.env.NISA_PASSWORD);
                
                if (hasilSemarang.success) {
                    await sock.sendMessage(from, { text: hasilSemarang.data }, { origin: from }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Gagal:* ${hasilSemarang.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }
        
        // 8. COMMAND: .prempsmg (Cek Pre-MP Open Area Semarang Only)
else if (command === '.prempsmg') {
    await sock.sendMessage(from, { text: '⏳ Sedang menarik monitoring Pre-MP Open area Semarang secara real-time dari NISA...' }, { quoted: msg });
    try {
        // Memanggil fungsi dari file scraper yang sama dengan .olt
        const { scrapePreMpSemarang } = require('../scrapers/nisaScraper');
        const hasilPreMp = await scrapePreMpSemarang();
        
        if (hasilPreMp.success) {
            // Kirim teks laporan panjang yang sudah disusun rapi oleh scraper
            await sock.sendMessage(from, { text: hasilPreMp.data }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilPreMp.error}` }, { quoted: msg });
        }
    } catch (err) { 
        await sock.sendMessage(from, { text: `⚠️ *Error:* ${err.message}` }, { quoted: msg }); 
    }
}


        // 9. COMMAND: .cekmp [Nomor MP]
        else if (command === '.cekmp') {
            const inputMp = argsRaw[0];
            if (!inputMp) return await sock.sendMessage(from, { text: ' *Format Salah!*\nContoh: *\.cekmp MP2026060263*' }, { quoted: msg });

            await sock.sendMessage(from, { text: ` Membongkar rincian port OLT untuk *${inputMp.toUpperCase()}*, mohon tunggu...` }, { quoted: msg });
            try {
                const { cekDetailMp } = require('../scrapers/nisaScraper');
                const hasilMpDtl = await cekDetailMp(inputMp);
                
                if (hasilMpDtl.success) {
                    await sock.sendMessage(from, { text: hasilMpDtl.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Gagal:* ${hasilMpDtl.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }
        
        // ==========================================
        // FITUR BARU: .cekhost [tmas_id]
        // ==========================================
        else if (command === '.cekhost') {
            const tmasId = argsRaw[0];

            if (!tmasId) return await sock.sendMessage(from, { text: ' *Format Salah!*\nContoh: *\.cekhost 323629*' }, { quoted: msg });

            await sock.sendMessage(from, { text: ` Menghubungi API NISA untuk membongkar detail port ID *${tmasId}*, mohon tunggu...` }, { quoted: msg });
            try {
                const { cekDetailHost } = require('../scrapers/nisaScraper');
                const hasilHostDtl = await cekDetailHost(tmasId);
                
                if (hasilHostDtl.success) {
                    await sock.sendMessage(from, { text: hasilHostDtl.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Gagal:* ${hasilHostDtl.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }

        // 10. COMMAND: .preopen
        else if (command === '.preopen') {
            await sock.sendMessage(from, { text: ' Sedang menarik database Pre-MP Open All Region dari NISA...' }, { quoted: msg });
            try {
                const { scrapePreOpen } = require('../scrapers/nisaScraper');
                const hasilPre = await scrapePreOpen(process.env.NISA_USER, process.env.NISA_PASSWORD);
                
                if (hasilPre.success) {
                    await sock.sendMessage(from, { text: hasilPre.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: ` *Gagal:* ${hasilPre.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: ` *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }
    });
}

async function sendMessage(to, text) {
    if (!sock) return;
    let targetJid = to;
    if (!targetJid.endsWith('@g.us') && !targetJid.endsWith('@s.whatsapp.net')) {
        let formatted = targetJid.replace(/[^0-9]/g, '');
        if (formatted.startsWith('0')) formatted = '62' + formatted.slice(1);
        targetJid = `${formatted}@s.whatsapp.net`;
    }
    await sock.sendMessage(targetJid, { text });
}

module.exports = { initWhatsApp, sendMessage };
