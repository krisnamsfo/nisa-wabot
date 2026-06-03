const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const os = require('os');
const fs = require('fs'); 
const path = require('path'); 

let sock = null;
const NODE_BOT_NUMBER = '6281333148055'; 

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
                console.log(`\n🔑 PAIRING CODE ANDA: ${code}\n`);
            } catch (error) { console.error('[WA] Gagal meminta pairing code:', error.message); }
        }, 6000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) { setTimeout(() => { initWhatsApp(); }, 5000); }
        } else if (connection === 'open') { console.log('[WA] WhatsApp Bot SIAP BEROPERASI!'); 
        //  TAMBAHKAN DUA BARIS KODE INI DI SINI:
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
        
        const command = body.trim().toLowerCase();


// =========================================================================
// LOG COMMAND MASUK (Versi Paling Aman & Bebas Error)
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
}



        // ==========================================
        // COMMAND: .menu (PANDUAN UTAMA TEKNISI)
        // ==========================================
        if (command === '.menu' || command === '.help') {
            let menuTeks = `📖 *PANDUAN & MENU BOT NISA WABOT* 📖\n`;
            menuTeks += `==================================\n\n`;
            
            menuTeks += `🔴 *MONITORING FAT LOSS*\n`;
            menuTeks += `🔹 *\.nisa*\n`;
            menuTeks += `   _Fungsi:_ Menampilkan seluruh data Fat Loss yang sedang Open (Semarang).\n`;
            menuTeks += `🔹 *\.nisadone*\n`; // <-- DIUBAH KESINI
            menuTeks += `   _Fungsi:_ Menampilkan daftar tiket Fat Loss yang sudah diselesaikan (DONE) beserta hasil penanganan di lapangan.\n`;
            menuTeks += `🔹 *\.cekfat [No_Tiket_FT]*\n`;
            menuTeks += `   _Fungsi:_ Melakukan Real-time Ping ONT massal khusus untuk tiket FT tersebut.\n`;
            menuTeks += `   _Contoh:_ \`.cekfat FT260600316\`\n\n`;

            menuTeks += `🚨 *MONITORING GAMAS (MASS PROBLEM)*\n`;
            menuTeks += `🔹 *\.olt* atau *\.gamasolt*\n`;
            menuTeks += `   _Fungsi:_ Menampilkan daftar Gangguan Massal OLT yang berstatus OPEN secara global.\n`;
            menuTeks += `🔹 *\.cekmp [No_MP]*\n`;
            menuTeks += `   _Fungsi:_ Membongkar rincian detail port OLT dan sebaran dampak dari nomor Mass Problem terkait.\n`;
            menuTeks += `   _Contoh:_ \`.cekmp MP2026060263\`\n\n`;

            menuTeks += `📌 *MONITORING PRE-MP OPEN*\n`;
            menuTeks += `🔹 *\.preopen*\n`;
            menuTeks += `   _Fungsi:_ Menampilkan database indikasi gangguan awal (Pre-Mass Problem) sebelum naik status jadi Gamas resmi.\n`;
            menuTeks += `🔹 *\.cekhost [ID_Tmas]*\n`;
            menuTeks += `   _Fungsi:_ Membongkar rincian port, posisi frame/slot, serta nama cluster terdampak berdasarkan ID Pre-MP.\n`;
            menuTeks += `   _Contoh:_ \`.cekhost 323629\`\n\n`;

            menuTeks += `==================================\n`;
            menuTeks += `💡 _Ketik perintah persis sesuai contoh. Pastikan menggunakan tanda titik (.) di awal command._`;

            return await sock.sendMessage(from, { text: menuTeks }, { quoted: msg });
        }
        


        // 1. COMMAND: .idchat
        if (command === '.idchat') {
            const isGroup = from.endsWith('@g.us');
            const teksId = `🆔 *INFO ID CHAT*\n\n🔹 *ID Saat Ini:* \`${from}\`\n🔹 *Tipe Chat:* ${isGroup ? 'Grup' : 'Private Chat'}\n\n_Silakan salin ID di atas untuk dimasukkan ke database manual._`;
            return await sock.sendMessage(from, { text: teksId }, { quoted: msg });
        }

        // 2. COMMAND: .uptime
        if (command === '.uptime') {
            const responUptime = `*─── VPS UPTIME STATUS ───*\n\n⏱️ *Uptime:* ${formatUptime(os.uptime())}\n📅 *Waktu Server:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
            await sock.sendMessage(from, { text: responUptime }, { quoted: msg });
        }

        // 3. COMMAND: .vps
        else if (command === '.vps') {
            const infoVPS = `*─── VPS HARDWARE SPEC ───*\n\n💻 *CPU Core:* ${os.cpus().length}\n📟 *RAM:* ${bytesToGB(os.totalmem() - os.freemem())} GB / ${bytesToGB(os.totalmem())} GB\n💿 *OS:* ${os.platform()}`;
            await sock.sendMessage(from, { text: infoVPS }, { quoted: msg });
        }

        // 4. COMMAND: .nisa
        else if (command === '.nisa') {
            await sock.sendMessage(from, { text: '⏳ Sedang mengumpulkan data dari Portal NISA, mohon tunggu...' }, { quoted: msg });
            try {
                const { scrapeNisa } = require('../scrapers/nisaScraper');
                const config = require('../config/config');
                const hasilScrape = await scrapeNisa(config.nisa.username, config.nisa.password);
                await sock.sendMessage(from, { text: hasilScrape.data }, { quoted: msg });
            } catch (err) { await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); }
        }


                // ==========================================
        // COMMAND BARU: .nisadone
        // ==========================================
        else if (command === '.nisadone') {
            await sock.sendMessage(from, { text: '⏳ Menghubungi API NISA untuk menarik riwayat tiket Fat Loss DONE, mohon tunggu...' }, { quoted: msg });
            try {
                const { scrapeFatLossDone } = require('../scrapers/nisaScraper');
                const hasilFatDone = await scrapeFatLossDone();
                
                if (hasilFatDone.success) {
                    await sock.sendMessage(from, { text: hasilFatDone.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilFatDone.error}` }, { quoted: msg });
                }
            } catch (err) {
                await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
            }
        }
        



        // 5. COMMAND: .cektiket [No Tiket FT]
        else if (command.startsWith('.cektiket')) {
            const args = body.trim().split(/ +/).slice(1);
            const inputTiket = args[0];
            if (!inputTiket) return await sock.sendMessage(from, { text: '❌ *Format Salah!*\nContoh: *\.cektiket FT260600316*' }, { quoted: msg });

            await sock.sendMessage(from, { text: `⏳ Sedang membongkar data pelanggan untuk *${inputTiket}*, mohon tunggu...` }, { quoted: msg });
            try {
                const { cekDetailTiket } = require('../scrapers/nisaScraper');
                const hasilDetail = await cekDetailTiket(inputTiket);
                
                if (hasilDetail.success) {
                    await sock.sendMessage(from, { text: hasilDetail.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilDetail.error}` }, { quoted: msg });
                }
                
            } catch (err) { await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); }
        }

        // 6. COMMAND: .cekfat [No Tiket FT]
        else if (command.startsWith('.cekfat')) {
            const args = body.trim().split(/ +/).slice(1);
            const inputTiket = args[0];
            if (!inputTiket) return await sock.sendMessage(from, { text: '❌ *Format Salah!*\nContoh: *\.cekfat FT260600316*' }, { quoted: msg });

            await sock.sendMessage(from, { text: `⏳ Melakukan Real-time Ping ONT massal untuk tiket *${inputTiket}*, mohon tunggu beberapa saat...` }, { quoted: msg });
            try {
                const { cekStatusFat } = require('../scrapers/nisaScraper');
                const hasilFat = await cekStatusFat(inputTiket);
                
                if (hasilFat.success) {
                    await sock.sendMessage(from, { text: hasilFat.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilFat.error}` }, { quoted: msg });
                }
                
            } catch (err) { await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); }
        }

        // 7. COMMAND: .olt / .gamasolt
        else if (command === '.olt' || command === '.gamasolt') {
            await sock.sendMessage(from, { text: '⏳ Sedang menarik monitoring gangguan OLT secara real-time dari NISA...' }, { quoted: msg });
            try {
                const { scrapeGamasOlt } = require('../scrapers/nisaScraper');
                const hasilOlt = await scrapeGamasOlt();
                
                if (hasilOlt.success) {
                    await sock.sendMessage(from, { text: hasilOlt.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilOlt.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }

        // 8. COMMAND: .oltsmg (KHUSUS MONITORING AREA SEMARANG)
        else if (command === '.oltsmg') {
            await sock.sendMessage(from, { text: '⏳ Sedang mengecek database MP Open khusus Area Semarang...' }, { quoted: msg });
            try {
                const { scrapeGamasSemarang } = require('../scrapers/nisaScraper');
                const config = require('../config/config');
                const hasilSemarang = await scrapeGamasSemarang(config.nisa.username, config.nisa.password);
                
                if (hasilSemarang.success) {
                    await sock.sendMessage(from, { text: hasilSemarang.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilSemarang.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }

        // 9. COMMAND: .cekmp [Nomor MP]
        else if (command.startsWith('.cekmp')) {
            const args = body.trim().split(/ +/).slice(1);
            const inputMp = args[0];
            if (!inputMp) return await sock.sendMessage(from, { text: '❌ *Format Salah!*\nContoh: *\.cekmp MP2026060263*' }, { quoted: msg });

            await sock.sendMessage(from, { text: `⏳ Membongkar rincian port OLT untuk *${inputMp.toUpperCase()}*, mohon tunggu...` }, { quoted: msg });
            try {
                const { cekDetailMp } = require('../scrapers/nisaScraper');
                const hasilMpDtl = await cekDetailMp(inputMp);
                
                if (hasilMpDtl.success) {
                    await sock.sendMessage(from, { text: hasilMpDtl.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilMpDtl.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }
        
        // ==========================================
        // FITUR BARU: .cekhost [tmas_id]
        // ==========================================
        else if (command.startsWith('.cekhost')) {
            const args = body.trim().split(/ +/).slice(1);
            const tmasId = args[0]; // Hanya mengambil argumen pertama (ID)

            if (!tmasId) return await sock.sendMessage(from, { text: '❌ *Format Salah!*\nContoh: *\.cekhost 323629*' }, { quoted: msg });

            await sock.sendMessage(from, { text: `⏳ Menghubungi API NISA untuk membongkar detail port ID *${tmasId}*, mohon tunggu...` }, { quoted: msg });
            try {
                const { cekDetailHost } = require('../scrapers/nisaScraper');
                const hasilHostDtl = await cekDetailHost(tmasId);
                
                if (hasilHostDtl.success) {
                    await sock.sendMessage(from, { text: hasilHostDtl.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilHostDtl.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); 
            }
        }


        // 10. COMMAND: .preopen (FITUR BARU)
        else if (command === '.preopen') {
            await sock.sendMessage(from, { text: '⏳ Sedang menarik database Pre-MP Open All Region dari NISA...' }, { quoted: msg });
            try {
                const { scrapePreOpen } = require('../scrapers/nisaScraper');
                const config = require('../config/config'); 
                const hasilPre = await scrapePreOpen(config.nisa.username, config.nisa.password);
                
                if (hasilPre.success) {
                    await sock.sendMessage(from, { text: hasilPre.data }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { text: `❌ *Gagal:* ${hasilPre.error}` }, { quoted: msg });
                }
            } catch (err) { 
                await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }); 
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
