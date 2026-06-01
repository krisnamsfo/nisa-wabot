const express = require('express');
const config = require('./config/config');
const { initWhatsApp, sendMessage } = require('./handlers/whatsappHandler');
const { scrapeNisa } = require('./scrapers/nisaScraper');

const app = express();
app.use(express.json());

// Endpoint untuk trigger monitoring manual/cron
app.post('/api/monitor', async (req, res) => {
    // Ambil dari request body, kalau kosong pakai dari file .env
    const username = req.body.username || config.nisa.username;
    const password = req.body.password || config.nisa.password;
    const phone = req.body.target_phone || config.targetPhone;

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

// Jalankan Server dan Bot WA
app.listen(config.port, () => {
    console.log(`[System] Server API aktif di port ${config.port}`);
    initWhatsApp();
});
