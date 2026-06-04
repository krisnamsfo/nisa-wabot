// =========================================================================
// BARIS UTAMA: AKTIFKAN DOTENV AGAR BISA MEMBACA FILE .ENV
// =========================================================================
require('dotenv').config();

const express = require('express');
const { initWhatsApp, sendMessage } = require('./handlers/whatsappHandler');
const { scrapeNisa, scrapeGamasSemarang, scrapePreMpSemarang } = require('./scrapers/nisaScraper'); 
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Cache terpisah agar notifikasi tidak spam
let infoGamasTerakhir = ""; 
let infoFatlossTerakhir = ""; 
let infoPreMpTerakhir = ""; 

// Fungsi Pembantu Mengambil Daftar ID Grup secara dinamis dari database.json
function getDaftarGrup() {
    const dbPath = path.join(__dirname, './database.json');
    if (!fs.existsSync(dbPath)) {
        console.error('[Auto Update] File database.json tidak ditemukan!');
        return [];
    }
    try {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        // Disamakan menggunakan 'daftarGrup' sesuai isi database.json
        return db.daftarGrup || []; 
    } catch (e) {
        console.error('[Auto Update] Gagal membaca file database.json:', e.message);
        return [];
    }
}

// Endpoint trigger monitoring manual/cron
app.post('/api/monitor', async (req, res) => {
    // Ambil langsung dari file .env secara aman
    const username = req.body.username || process.env.NISA_USER;
    const password = req.body.password || process.env.NISA_PASSWORD;
    const phone = req.body.target_phone || '6281333148055'; // Nilai cadangan langsung

    res.status(202).json({ message: 'Proses monitoring berjalan di background.' });

    console.log('[System] Memulai trigger monitoring...');
    const result = await scrapeNisa(username, password);

    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (result.success) {
        const pesan = `*--- LAPORAN MONITORING NISA ---*\n\nWaktu: ${waktu}\n\n*Data:* \n${result.data}`;
        await sendMessage(phone, pesan);
    } else {
        const pesanGagal = `❌ *Monitoring Gagal!*\nWaktu: ${waktu}\nError: ${result.error}`;
        await sendMessage(phone, pesanGagal);
    }
});

// Pastikan definisi path file cache ini berada di bagian atas file index.js
const PATH_CACHE_GAMAS = path.join(__dirname, 'cacheGamas.json');
const PATH_CACHE_FATLOSS = path.join(__dirname, 'cacheFatloss.json');
const PATH_CACHE_PREMP = path.join(__dirname, 'cachePreMp.json');
const PATH_DATABASE = path.join(__dirname, 'database.json');



// 1. Pengecekan Gamas OLT Semarang
async function cekGamasOtomatis() {
    try {
        console.log(`[${new Date().toLocaleTimeString('id-ID')}] [Auto Gamas] Mengecek data terbaru...`);
        const hasil = await scrapeGamasSemarang(process.env.NISA_USER, process.env.NISA_PASSWORD);
        
        if (!hasil || !hasil.success) {
            console.error('[Auto Gamas] Gagal mengambil data atau sukses bernilai false');
            return;
        }

        const dataSekarang = hasil.data ? hasil.data.trim() : '';
        
        let cacheTiketLama = [];
        if (fs.existsSync(PATH_CACHE_GAMAS)) {
            try { cacheTiketLama = JSON.parse(fs.readFileSync(PATH_CACHE_GAMAS, 'utf-8')); } catch (e) { cacheTiketLama = []; }
        }

        const regexGamas = /(?:MP)\d+[A-Z0-9]*/g;
        const tiketMentah = dataSekarang.match(regexGamas) || [];
        const tiketSaatIni = [...new Set(tiketMentah)];

        const dbData = JSON.parse(fs.readFileSync(PATH_DATABASE, 'utf-8'));
        const daftarGrup = dbData.daftarGrup?.gamas || [];

        // KONDISI JIKA DATA CLEAN / KOSONG / SEMUA DONE
        if (!dataSekarang || dataSekarang.includes('tidak ada') || dataSekarang === '' || tiketSaatIni.length === 0) {
            if (cacheTiketLama.length > 0) {
                console.log('[Auto Gamas] Deteksi semua gangguan GAMAS OLT clear/done!');
                let pesanDone = `🎉 *NOTIFIKASI SELURUH GANGGUAN GAMAS OLT DONE (SEMARANG)* 🎉\n\n`;
                cacheTiketLama.forEach(noTiket => { pesanDone += `✅ Tiket *${noTiket}* -> CLOSED/DONE\n`; });
                
                for (const grupId of daftarGrup) {
                    await sendMessage(grupId, pesanDone);
                }
                fs.writeFileSync(PATH_CACHE_GAMAS, JSON.stringify([], null, 2), 'utf-8');
            }
            return;
        }

        if (!fs.existsSync(PATH_CACHE_GAMAS)) {
            fs.writeFileSync(PATH_CACHE_GAMAS, JSON.stringify(tiketSaatIni, null, 2), 'utf-8');
            return;
        }

        // DETEKSI TIKET BARU
        const tiketBaru = tiketSaatIni.filter(noTiket => !cacheTiketLama.includes(noTiket));
        if (tiketBaru.length > 0) {
            console.log(`[Auto Gamas] Deteksi tiket baru: ${tiketBaru.join(', ')}`);
            const pesanNotif = `📢 *NOTIFIKASI PUSH GAMAS OLT BARU (SEMARANG)* 📢\n\n${dataSekarang}\n\n📌 *Tiket Baru:* ${tiketBaru.join(', ')}`;
            for (const grupId of daftarGrup) {
                await sendMessage(grupId, pesanNotif);
            }
        }

        // DETEKSI TIKET DONE / CLOSED
        const tiketYangSelesai = cacheTiketLama.filter(noTiket => !tiketSaatIni.includes(noTiket));
        if (tiketYangSelesai.length > 0) {
            console.log(`[Auto Gamas] Deteksi tiket closed: ${tiketYangSelesai.join(', ')}`);
            let pesanDone = `✅ *NOTIFIKASI GANGGUAN GAMAS DONE (SEMARANG)* ✅\n\n`;
            tiketYangSelesai.forEach(noTiket => { pesanDone += `📌 Tiket OLT *${noTiket}* telah Selesai/Closed.\n`; });
            for (const grupId of daftarGrup) {
                await sendMessage(grupId, pesanDone);
            }
        }

        fs.writeFileSync(PATH_CACHE_GAMAS, JSON.stringify(tiketSaatIni, null, 2), 'utf-8');
    } catch (error) {
        console.error('[Auto Gamas] Error:', error.message);
    }
}

// 2. Pengecekan Fatloss Open
async function cekFatlossOtomatis() {
    try {
        console.log(`[${new Date().toLocaleTimeString('id-ID')}] [Auto Fatloss] Mengecek data terbaru...`);
        const hasil = await scrapeNisa(process.env.NISA_USER, process.env.NISA_PASSWORD);
        
        if (!hasil || !hasil.success) return;

        const dataSekarang = hasil.data ? hasil.data.trim() : '';
        let cacheTiketLama = [];
        if (fs.existsSync(PATH_CACHE_FATLOSS)) {
            try { cacheTiketLama = JSON.parse(fs.readFileSync(PATH_CACHE_FATLOSS, 'utf-8')); } catch (e) { cacheTiketLama = []; }
        }

        const regexFatloss = /FT\d+[A-Z0-9]*/g;
        const tiketSaatIni = [...new Set(dataSekarang.match(regexFatloss) || [])];

        const dbData = JSON.parse(fs.readFileSync(PATH_DATABASE, 'utf-8'));
        const daftarGrup = dbData.daftarGrup?.fatloss || [];

        // KONDISI DATA CLEAN
        if (!dataSekarang || dataSekarang.includes('tidak ada') || dataSekarang === '' || tiketSaatIni.length === 0) {
            if (cacheTiketLama.length > 0) {
                let pesanDone = `🎉 *NOTIFIKASI SELURUH TIKET FATLOSS DONE* 🎉\n\n`;
                cacheTiketLama.forEach(noTiket => { pesanDone += `✅ Tiket *${noTiket}* -> CLOSED/DONE\n`; });
                for (const grupId of daftarGrup) {
                    await sendMessage(grupId, pesanDone);
                }
                fs.writeFileSync(PATH_CACHE_FATLOSS, JSON.stringify([], null, 2), 'utf-8');
            }
            return;
        }

        if (!fs.existsSync(PATH_CACHE_FATLOSS)) {
            fs.writeFileSync(PATH_CACHE_FATLOSS, JSON.stringify(tiketSaatIni, null, 2), 'utf-8');
            return;
        }

        // DETEKSI TIKET BARU & DONE
        const tiketBaru = tiketSaatIni.filter(noTiket => !cacheTiketLama.includes(noTiket));
        const tiketSelesai = cacheTiketLama.filter(noTiket => !tiketSaatIni.includes(noTiket));

        if (tiketBaru.length > 0) {
            const pesanNotif = `⚠️ *NOTIFIKASI PUSH FATLOSS OPEN BARU* ⚠️\n\n${dataSekarang}\n\n📌 *Tiket Baru:* ${tiketBaru.join(', ')}`;
            for (const grupId of daftarGrup) {
                await sendMessage(grupId, pesanNotif);
            }
        }

        if (tiketSelesai.length > 0) {
            let pesanDone = `✅ *NOTIFIKASI TIKET CLOSED (FATLOSS)* ✅\n\n`;
            tiketSelesai.forEach(noTiket => { pesanDone += `📌 Tiket *${noTiket}* telah diselesaikan.\n`; });
            for (const grupId of daftarGrup) {
                await sendMessage(grupId, pesanDone);
            }
        }

        fs.writeFileSync(PATH_CACHE_FATLOSS, JSON.stringify(tiketSaatIni, null, 2), 'utf-8');
    } catch (error) {
        console.error('[Auto Fatloss] Error:', error.message);
    }
}


// 3. Pengecekan Pre-MP Open Semarang + Validasi Cross-Check ke GAMAS
async function cekPreMpOtomatis() {
    try {
        console.log(`[${new Date().toLocaleTimeString('id-ID')}] [Auto Pre-MP] Mengecek data terbaru Semarang...`);
        const hasil = await scrapePreMpSemarang(process.env.NISA_USER, process.env.NISA_PASSWORD);
        
        if (!hasil || !hasil.success) {
            console.error('[Auto Pre-MP] Gagal mengambil data Pre-MP');
            return;
        }

        const dataSekarang = hasil.data ? hasil.data.trim() : '';
        
        let cachePreMpLama = [];
        if (fs.existsSync(PATH_CACHE_PREMP)) {
            try { cachePreMpLama = JSON.parse(fs.readFileSync(PATH_CACHE_PREMP, 'utf-8')); } catch (e) { cachePreMpLama = []; }
        }

        // AMBIL ID_TMAS (Angka murni 5-8 digit)
        const regexIDTmas = /\b\d{5,8}\b/g;
        const tiketMentah = dataSekarang.match(regexIDTmas) || [];
        const cachePreMpSekarang = [...new Set(tiketMentah)]; // Hilangkan Duplikat

        // KONDISI JIKA DATA CLEAN / KOSONG / SEMUA DONE LANGSUNG DARI SOURCE PREMP
        if (!dataSekarang || dataSekarang.includes('tidak ada') || dataSekarang === '' || cachePreMpSekarang.length === 0) {
            if (cachePreMpLama.length === 0) {
                return; // Memang benar-benar bersih sejak awal, tidak perlu diproses
            }
            console.log('[Auto Pre-MP] Source kosong atau semua tiket clear. Memproses pembersihan dengan validasi silang...');
        }

        // KONDISI RUNNING PERTAMA KALI
        if (!fs.existsSync(PATH_CACHE_PREMP)) {
            fs.writeFileSync(PATH_CACHE_PREMP, JSON.stringify(cachePreMpSekarang, null, 2), 'utf-8');
            console.log('[Auto Pre-MP] Cache awal ID_Tmas berhasil disimpan.');
            return;
        }

        const dbData = JSON.parse(fs.readFileSync(PATH_DATABASE, 'utf-8'));
        const idGrupPreMp = dbData.daftarGrup?.premp || [];
        const idGrupGamas = dbData.daftarGrup?.gamas || [];

        // 1. DETEKSI ID_TMAS BARU MASUK PRE-MP
        const tiketBaru = cachePreMpSekarang.filter(idTmas => !cachePreMpLama.includes(idTmas));
        if (tiketBaru.length > 0 && idGrupPreMp.length > 0) {
            console.log(`[Auto Pre-MP] Deteksi ID_Tmas baru: ${tiketBaru.join(', ')}`);
            const pesanNotif = `🚨 *NOTIFIKASI PUSH PRE-MP OPEN BARU (SEMARANG)* 🚨\n\n${dataSekarang}\n\n📌 *ID Tmas Baru:* ${tiketBaru.join(', ')}`;
            
            for (const grupId of idGrupPreMp) {
                await sendMessage(grupId, pesanNotif);
            }
        }

        // 2. DETEKSI ID_TMAS YANG HILANG (Validasi Silang Khusus)
        const tiketYangHilang = cachePreMpLama.filter(idTmas => !cachePreMpSekarang.includes(idTmas));
        
        if (tiketYangHilang.length > 0) {
            console.log(`[Auto Pre-MP] Mendeteksi ${tiketYangHilang.length} ID_Tmas hilang dari radar. Melakukan validasi silang langsung ke API GAMAS...`);
            
            // 💡 AMBIL DATA RAW DARI API MASSPROBLEM SECARA LANGSUNG UNTUK CROSS-CHECK AKURAT
            const jwtToken = process.env.NISA_TOKEN;
            let listGamasRaw = [];
            
            try {
                const responseGamas = await axios.get('https://nisa.myrepublic.net.id/api/transaction/massproblem/getdata', {
                    params: {
                        '_dc': Date.now(), 'tmas_area_id': '', 'tmas_massproblem_no': '', 'tmas_start_date': '', 'tmas_end_date': '',
                        'tmas_category': '', 'tmas_category_problem': '', 'ftmad_cid': '', 'bxmq_clusters': '', 'bxmq_hostname': '',
                        'tmas_status': '1', 'trxType': '1', 'tmas_is_pre_massproblem': '0', 'page': '1', 'start': '0', 'limit': '150'
                    },
                    headers: getBaseHeaders(jwtToken)
                });
                if (responseGamas.data && responseGamas.data.success === true) {
                    listGamasRaw = responseGamas.data.data || [];
                }
            } catch (errApi) {
                console.error('[Auto Pre-MP] Gagal melakukan request cross-check langsung ke API GAMAS:', errApi.message);
            }

            // Mulai pengecekan satu-per-satu untuk ID Tmas yang hilang
            for (const idTmas of tiketYangHilang) {
                const idTmasString = String(idTmas);

                // Cari di list raw data GAMAS apakah ada item yang tmas_id atau tmas_massproblem_no nya cocok
                const ditemukanDiGamas = listGamasRaw.find(olt => {
                    return (olt.tmas_id && String(olt.tmas_id) === idTmasString) || 
                           (olt.tmas_massproblem_no && String(olt.tmas_massproblem_no).includes(idTmasString)) ||
                           (olt.tmas_link_dtl && String(olt.tmas_link_dtl).includes(idTmasString));
                });

                if (ditemukanDiGamas) {
                    // VALIDASI SUKSES: Tiket terbukti lompat/eskalasi menjadi GAMAS resmi
                    const noTiketGamasBaru = ditemukanDiGamas.tmas_massproblem_no || "MP-MIGRASI-UNKNOWN";
                    console.log(`[Auto Pre-MP] 🔥 VALID! ID_Tmas ${idTmas} LOMPAT menjadi GAMAS OLT dengan Tiket: ${noTiketGamasBaru}`);

                    // Ambil cache gamas lama agar tidak mengirim push ganda di fungsi gamas utama
                    let cacheGamasLama = [];
                    if (fs.existsSync(PATH_CACHE_GAMAS)) {
                        try { cacheGamasLama = JSON.parse(fs.readFileSync(PATH_CACHE_GAMAS, 'utf-8')); } catch (e) { cacheGamasLama = []; }
                    }

                    // Suntik nomor tiket baru ke cacheGamas agar dibungkam pada auto-gamas berikutnya
                    cacheGamasLama.push(noTiketGamasBaru);
                    fs.writeFileSync(PATH_CACHE_GAMAS, JSON.stringify([...new Set(cacheGamasLama)], null, 2), 'utf-8');

                    // Kirim Push Alert Eskalasi ke semua Grup GAMAS
                    if (idGrupGamas.length > 0) {
                        let pesanEskalasi = `📢 *ESKALASI PRE-MP KE GAMAS OLT (SEMARANG)* 📢\n`;
                        pesanEskalasi += `========================================\n\n`;
                        pesanEskalasi += `Status investigasi *ID Tmas ${idTmas}* telah selesai dan DIALIKAN menjadi gangguan massal resmi tingkat OLT!\n\n`;
                        pesanEskalasi += `📌 *ID Tmas Asal:* ${idTmas}\n`;
                        pesanEskalasi += `🎟️ *No Tiket GAMAS Baru:* *${noTiketGamasBaru}*\n`;
                        pesanEskalasi += `🖥️ *Host Name:* \`${ditemukanDiGamas.tmas_link_dtl || '-'}\`\n\n`;
                        pesanEskalasi += `_Sistem otomatis mengamankan cache agar tidak terjadi double-push notification._`;
                        
                        for (const grupId of idGrupGamas) {
                            await sendMessage(grupId, pesanEskalasi);
                        }
                    }
                } else {
                    // JIKA TIDAK DITEMUKAN DI OBJECT GAMAS APAPUN (Fix Close Murni / Di-Cancel / Done Teknis)
                    console.log(`[Auto Pre-MP] ID_Tmas ${idTmas} benar-benar tidak ditemukan di API GAMAS. Status: Close Murni.`);
                    
                    if (idGrupPreMp.length > 0) {
                        let pesanDone = `✅ *NOTIFIKASI TIKET CLOSED (PRE-MP SEMARANG)* ✅\n\n`;
                        pesanDone += `📌 Investigasi untuk ID Tmas *${idTmas}* telah Selesai/Closed di sistem tanpa eskalasi massal.\n`;
                        
                        for (const grupId of idGrupPreMp) {
                            await sendMessage(grupId, pesanDone);
                        }
                    }
                }
            }
        }

        // Simpan state terbaru ke cache
        fs.writeFileSync(PATH_CACHE_PREMP, JSON.stringify(cachePreMpSekarang, null, 2), 'utf-8');
    } catch (error) {
        console.error('[Auto Pre-MP] Error:', error.message);
    }
}



// BATAS


// =========================================================================
// FITUR BARU: KIRIM RANGKUMAN TIKET AKTIF SETIAP 1 JAM SEKALI (FIXED)
// =========================================================================
async function kirimRangkumanRutin() {
    try {
        console.log(`[${new Date().toLocaleTimeString('id-ID')}] 🕒 [Rangkuman Jam] Memproses rangkuman rutin ke grup...`);
        
        // Baca database.json untuk mendapatkan target grup WhatsApp
        if (!fs.existsSync(PATH_DATABASE)) return;
        const dbData = JSON.parse(fs.readFileSync(PATH_DATABASE, 'utf-8'));
        
        // Ambil daftar grup sebagai Array (Fallback ke array kosong jika tidak ada)
        const daftarGrupFatloss = dbData.daftarGrup?.fatloss || [];
        const daftarGrupGamas = dbData.daftarGrup?.gamas || [];
        const daftarGrupPreMp = dbData.daftarGrup?.premp || [];

        // -----------------------------------------------------------------
        // 1. RANGKUMAN TIKET FATLOSS
        // -----------------------------------------------------------------
        if (fs.existsSync(PATH_CACHE_FATLOSS) && daftarGrupFatloss.length > 0) {
            const cacheFatloss = JSON.parse(fs.readFileSync(PATH_CACHE_FATLOSS, 'utf-8'));
            if (cacheFatloss.length > 0) {
                let pesan = `🕒 *PENGINGAT RUTIN: DAFTAR TIKET FATLOSS OPEN* 🕒\n`;
                pesan += `========================================\n\n`;
                pesan += `Saat ini masih terdapat *${cacheFatloss.length}* tiket open yang memerlukan penanganan:\n\n`;
                cacheFatloss.forEach((noTiket, index) => {
                    pesan += `${index + 1}. 📄 Tiket: *${noTiket}*\n`;
                });
                pesan += `\ngunakan \`.cektiket [tiket]\` untuk melihat detail Tiket\n`;
                pesan += `\n💡 _Harap segera di-update jika sudah dikerjakan di lapangan._`;
                
                // Perulangan kirim ke semua grup Fatloss
                for (const grupId of daftarGrupFatloss) {
                    await sendMessage(grupId, pesan);
                }
                console.log(`[Rangkuman Jam] Sukses mengirim list Fatloss.`);
            }
        }

        // -----------------------------------------------------------------
        // 2. RANGKUMAN TIKET GAMAS
        // -----------------------------------------------------------------
        if (fs.existsSync(PATH_CACHE_GAMAS) && daftarGrupGamas.length > 0) {
            const cacheGamas = JSON.parse(fs.readFileSync(PATH_CACHE_GAMAS, 'utf-8'));
            if (cacheGamas.length > 0) {
                let pesan = `🕒 *PENGINGAT RUTIN: GANGGUAN GAMAS OLT* 🕒\n`;
                pesan += `========================================\n\n`;
                pesan += `⚠️ Perhatian! Masih ada *${cacheGamas.length}* gangguan GAMAS aktif:\n\n`;
                cacheGamas.forEach((noTiket, index) => {
                    pesan += `${index + 1}. 📢 Tiket: *${noTiket}*\n`;
                });
                pesan += `\ngunakan \`.cekmp [tiket]\` untuk melihat detail Tiket\n`;
                
                // Perulangan kirim ke semua grup Gamas
                for (const grupId of daftarGrupGamas) {
                    await sendMessage(grupId, pesan);
                }
                console.log(`[Rangkuman Jam] Sukses mengirim list Gamas.`);
            }
        }

        // -----------------------------------------------------------------
        // 3. RANGKUMAN TIKET PRE-MP SEMARANG
        // -----------------------------------------------------------------
        if (fs.existsSync(PATH_CACHE_PREMP) && daftarGrupPreMp.length > 0) {
            const cachePreMp = JSON.parse(fs.readFileSync(PATH_CACHE_PREMP, 'utf-8'));
            if (cachePreMp.length > 0) {
                let pesan = `🕒 *PENGINGAT RUTIN: TIKET PRE-MP SEMARANG* 🕒\n`;
                pesan += `========================================\n\n`;
                pesan += `Daftar tiket PRE-MP yang masih open (*${cachePreMp.length}* Tiket):\n\n`;
                cachePreMp.forEach((noTiket, index) => {
                    pesan += `${index + 1}. 🚨 Tiket: *${noTiket}*\n`;
                });
                pesan += `\ngunakan \`.cekhost [tiket]\` untuk melihat detail OLT\n`;
                
                // Perulangan kirim ke semua grup Pre-MP
                for (const grupId of daftarGrupPreMp) {
                    await sendMessage(grupId, pesan);
                }
                console.log(`[Rangkuman Jam] Sukses mengirim list Pre-MP.`);
            }
        }

    } catch (error) {
        console.error('[Rangkuman Jam] Error saat mengirim pengingat rutin:', error.message);
    }
}


// =========================================================================
// ARRANGEMENT TIMING (PEMICU WAKTU JALAN AWAL & RUTIN)
// =========================================================================

// 1. Trigger pertama: Jalankan otomatis 2 menit setelah bot running (2 menit = 120.000 ms)
setTimeout(() => {
    console.log(`[System] Menjalankan rangkuman tiket pertama (Trigger 2 Menit Awal)...`);
    kirimRangkumanRutin();
}, 2 * 60 * 1000);

// 2. Trigger rutin: Lanjutkan berkala setiap 1 jam sekali (1 jam = 3.600.000 ms)
setInterval(kirimRangkumanRutin, 60 * 60 * 1000);





// =========================================================================
// JALANKAN BACKGROUND JOB DENGAN JEDA 15 DETIK (VERSI FIX)
// =========================================================================
// Tambahkan baris ini tepat di atas fungsi jalankanSemuaPengecekan
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Fungsi Master untuk menjalankan semua background job dengan jeda aman
async function jalankanSemuaPengecekan() {
    console.log(`[${new Date().toLocaleTimeString('id-ID')}] 🔄 [System] Memulai rangkaian pengecekan otomatis...`);
    
    // 1. Cek Gamas OLT Semarang
    await cekGamasOtomatis();
    
    // Beri jeda 15 detik sebelum lanjut ke Fatloss
    console.log(`[System] Mengistirahatkan sesi selama 15 detik sebelum cek Fatloss...`);
    await delay(15000); 
    
    // 2. Cek Fatloss Open
    await cekFatlossOtomatis();
    
    // Beri jeda 15 detik sebelum lanjut ke Pre-MP
    console.log(`[System] Mengistirahatkan sesi selama 15 detik sebelum cek Pre-MP...`);
    await delay(15000);
    
    // 3. Cek Pre-MP Open Semarang
    await cekPreMpOtomatis();
    
    console.log(`[${new Date().toLocaleTimeString('id-ID')}] ✅ [System] Seluruh rangkaian pengecekan selesai. Menunggu interval berikutnya...`);
}

// =========================================================================
// =========================================================================
// RUN SERVER DAN BOT WA (VERSI DELAY AWAL 30 DETIK)
// =========================================================================
app.listen(PORT, () => {
    console.log(`[System] Server API aktif di port ${PORT}`);
    
    // 1. Jalankan WhatsApp Bot pertama kali
    initWhatsApp();

    // 2. Set timer rutin otomatis interval setiap 5 menit (300.000 ms)
    const JEDA_WAKTU = 5 * 60 * 1000; 
    setInterval(jalankanSemuaPengecekan, JEDA_WAKTU);
    console.log('[System] Loop pengecekan otomatis setiap 5 menit telah dijadwalkan.');

    // 3. PEMICU AWAL: Tunggu 30 detik (30.000 ms) setelah start, lalu jalankan pengecekan
    console.log('[System] Menunggu 30 detik awal agar koneksi WhatsApp stabil sebelum push notifikasi...');
    setTimeout(async () => {
        console.log('[System] 30 detik pertama tercapai! Menjalankan push notifikasi awal...');
        await jalankanSemuaPengecekan();
    }, 30000); // 30000 milidetik = 30 detik
});



