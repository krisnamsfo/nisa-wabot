const axios = require('axios');
require('dotenv').config();

function getBaseHeaders(jwtToken) {
    return {
        'Authorization': `Bearer ${jwtToken}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://nisa.myrepublic.net.id/'
    };
}

// Helper untuk mencari data tiket berdasarkan Nomor FT atau ID angka
async function temukanTiket(jwtToken, inputTiket) {
    const dcParam = Date.now();
    const listResponse = await axios.get('https://nisa.myrepublic.net.id/api/transaction/fatlossticketing/fatloss-assignment', {
        params: { '_dc': dcParam, 'status_fat': '0', 'workplace': '8', 'userGroup': 'MSFO,Massproblem Only', 'limit': '50' },
        headers: getBaseHeaders(jwtToken)
    });

    const allTickets = listResponse.data?.data || [];
    return allTickets.find(t => t.tlop_no.toUpperCase() === inputTiket.trim().toUpperCase() || String(t.tlop_id) === inputTiket.trim());
}

// Helper untuk penanganan tiket done (assignment done)
async function temukanTiketDone(jwtToken, inputTiket) {
    const dcParam = Date.now();
    const doneResponse = await axios.get('https://nisa.myrepublic.net.id/api/transaction/fatlossticketing/fatloss-assignment-done', {
        params: { '_dc': dcParam, 'status_fat': '0', 'workplace': '8', 'userGroup': 'MSFO,Massproblem Only', 'limit': '50' },
        headers: getBaseHeaders(jwtToken)
    });

    const allDoneTickets = doneResponse.data?.data || [];
    return allDoneTickets.find(t => t.tlop_no.toUpperCase() === inputTiket.trim().toUpperCase() || String(t.tlop_id) === inputTiket.trim());
}

// 1. MONITORING DAFTAR TIKET FATLOSS
async function scrapeNisa() {
    const jwtToken = process.env.NISA_TOKEN;
    if (!jwtToken) return { success: false, error: 'Token NISA belum diisi di file .env!' };

    try {
        const dcParam = Date.now(); 
        const targetResponse = await axios.get('https://nisa.myrepublic.net.id/api/transaction/fatlossticketing/fatloss-assignment', {
            params: { '_dc': dcParam, 'status_fat': '0', 'workplace': '8', 'userGroup': 'MSFO,Massproblem Only', 'page': '1', 'start': '0', 'limit': '25' },
            headers: getBaseHeaders(jwtToken)
        });

        const ticketData = targetResponse.data;

        if (ticketData && ticketData.success === true) {
            const listTiket = ticketData.data || [];
            if (listTiket.length === 0) {
                return { success: true, data: `🟢 *MONITORING PORTAL NISA*\n\nStatus: *Aman*\nAlhamdulillah, tidak ada tiket gangguan massal (Fatloss) saat ini.` };
            }

            let laporan = `🚨 *MONITORING FATLOSS PORTAL NISA* 🚨\n`;
            laporan += `==================================\n`;
            laporan += `📊 *Ringkasan Tiket Open:* ${ticketData.totalopen || listTiket.length}\n\n`;

            listTiket.forEach((tiket, index) => {
                const isTaken = tiket.tlop_taken_by || tiket.tlop_taken_date;
                const statusTakenText = isTaken ? `🔴 *Status:* Taken (Oleh: ${tiket.tlop_taken_by})` : `🟡 *Status:* Untaken (Belum Diambil)`;

                laporan += `${index + 1}. 📄 *No Tiket:* \`${tiket.tlop_no}\`\n`;
                laporan += `   ${statusTakenText}\n`;
                laporan += `   📁 *Kategori:* ${tiket.tlop_category_name || 'Loss Signal'}\n`;
                laporan += `   📍 *Cluster:* ${tiket.tlop_cluster_name}\n`;
                laporan += `   🔢 *FAT Design/Aktual:* ${tiket.tlop_fdt_code} / ${tiket.tlop_fat_actual || '-'}\n`;
                laporan += `   👥 *Total CID:* ${tiket.total_cid || 0} User\n`;
                laporan += `   🕒 *Aging:* ${tiket.aging_ticket || '-'}\n`;
                laporan += `   💡 _Ketik *\.cektiket ${tiket.tlop_no}* atau *\.cekfat ${tiket.tlop_no}*_\n`;
                laporan += `   ----------------------------------\n`;
            });

            return { success: true, data: laporan };
        } else {
            return { success: false, error: 'Gagal mengambil data dari list assignment.' };
        }
    } catch (error) {
        if (error.response?.status === 403) return { success: false, error: 'Token kedaluwarsa. Sila ambil token baru.' };
        return { success: false, error: error.message };
    }
}

// 2. CEK DETAIL CUSTOMER (CID & WO)
async function cekDetailTiket(inputTiket) {
    const jwtToken = process.env.NISA_TOKEN;
    if (!jwtToken) return { success: false, error: 'Token NISA belum diisi di file .env!' };

    try {
        let tlopId = inputTiket.trim();
        if (tlopId.toUpperCase().startsWith('FT')) {
            let matchedTicket = await temukanTiket(jwtToken, tlopId);
            
            if (!matchedTicket) {
                console.log(`[Scraper] Tiket ${tlopId} tidak ada di assignment aktif. Mencari di assignment done...`);
                matchedTicket = await temukanTiketDone(jwtToken, tlopId);
            }

            if (!matchedTicket) return { success: false, error: `Tiket *${tlopId}* tidak ditemukan di daftar aktif maupun done.` };
            tlopId = matchedTicket.tlop_id;
        }

        const dcParam = Date.now();
        const response = await axios.get('https://nisa.myrepublic.net.id/api/transaction/fatlossticketing/fatutilizationciddtl', {
            params: { '_dc': dcParam, 'tlop_id': tlopId, 'page': '1', 'start': '0', 'limit': '25' },
            headers: getBaseHeaders(jwtToken)
        });

        const resData = response.data;
        if (resData && resData.success === true) {
            const listCid = resData.data || [];
            if (listCid.length === 0) return { success: true, data: `ℹ️ Tidak ditemukan detail data Customer untuk Tiket *${inputTiket}*.` };

            let detailMsg = `🔍 *DETAIL CUSTOMER FATLOSS (${inputTiket.toUpperCase()})* 🔍\n`;
            detailMsg += `📍 *Cluster:* ${listCid[0].tlos_cluster_name || '-'}\n`;
            detailMsg += `==================================\n\n`;

            listCid.forEach((cust, idx) => {
                detailMsg += `${idx + 1}. 👤 *CID:* ${cust.tlos_customer_id}\n`;
                detailMsg += `   🛠️ *No WO:* ${cust.tlos_wo_number || '_Belum Terbit_'}\n`;
                detailMsg += `   🎫 *No Tiket CRM:* ${cust.tlos_ticket_number || '_Belum Terbit_'}\n`;
                detailMsg += `   ----------------------------------\n`;
            });

            return { success: true, data: detailMsg };
        } else {
            return { success: false, error: resData.msg || 'Gagal menarik data detail pelanggan.' };
        }
    } catch (error) {
        if (error.response?.status === 403) return { success: false, error: 'Token kedaluwarsa. Sila ambil token baru.' };
        return { success: false, error: error.message };
    }
}

// 3. CEK STATUS ONT / PING FAT MASSAL
async function cekStatusFat(inputTiket) {
    const jwtToken = process.env.NISA_TOKEN;
    if (!jwtToken) return { success: false, error: 'Token NISA belum diisi di file .env!' };

    try {
        let matchedTicket = await temukanTiket(jwtToken, inputTiket);
        
        if (!matchedTicket) {
            console.log(`[Scraper] Tiket ${inputTiket} tidak ada di assignment aktif. Mencari di assignment done...`);
            matchedTicket = await temukanTiketDone(jwtToken, inputTiket);
        }

        if (!matchedTicket) {
            return { success: false, error: `Tiket *${inputTiket}* tidak ditemukan di daftar aktif maupun done.` };
        }

        const tlopId = matchedTicket.tlop_id;
        const rawCids = matchedTicket.tlos_customer_id;

        if (!rawCids) {
            return { success: false, error: `Tidak ada data Customer ID (CID) yang terikat di tiket *${inputTiket}*.` };
        }

        const arrCids = rawCids.split(',');
        const dcParam = Date.now();

        const queryParams = new URLSearchParams();
        queryParams.append('_dc', dcParam);
        arrCids.forEach(cid => queryParams.append('data', cid.trim()));
        queryParams.append('tlos_id', tlopId);
        queryParams.append('customer_id', rawCids);

        console.log(`[Scraper] Melakukan pengecekan status ONT massal untuk Tiket ${inputTiket}...`);

        const response = await axios.get('https://nisa.myrepublic.net.id/api/transaction/fatlossticketing/check-ont-status', {
            params: queryParams,
            paramsSerializer: params => params.toString(),
            headers: getBaseHeaders(jwtToken)
        });

        const resData = response.data;

        if (resData && resData.success === true) {
            const listOnt = resData.data || [];
            if (listOnt.length === 0) return { success: true, data: `ℹ️ Tidak ada respon status ONT dari server untuk tiket *${inputTiket}*.` };

            let statusMsg = `📡 *HASIL CEK STATUS ONT FAT / CLUSTER* 📡\n`;
            statusMsg += `📄 *No Tiket:* ${matchedTicket.tlop_no}\n`;
            statusMsg += `📍 *Cluster:* ${matchedTicket.tlop_cluster_name}\n`;
            statusMsg += `==================================\n\n`;

            listOnt.forEach((ont, idx) => {
                const emojiStatus = ont.ont_status === 'online' ? '🟢' : '🔴';
                const redaman = ont.rx_level ? `${ont.rx_level} dBm` : '_Loss Signal / Offline_';
                
                statusMsg += `${idx + 1}. 👤 *CID:* ${ont.cid}\n`;
                statusMsg += `   ⚡ *Status ONT:* ${emojiStatus} *${ont.ont_status.toUpperCase()}*\n`;
                statusMsg += `   📉 *Rx Level (Redaman):* ${redaman}\n`;
                statusMsg += `   ⚙️ *F/S/P/ID:* ${ont.frame || 0}/${ont.slot || 0}/${ont.port || 0}/${ont.ont_id || 0}\n`;
                statusMsg += `   🧮 *SN ONT:* ${ont.serial_number || '-'}\n`;
                statusMsg += `   🌡️ *Temperatur:* ${ont.temperature ? `${ont.temperature}°C` : '-'}\n`;
                statusMsg += `   ----------------------------------\n`;
            });

            statusMsg += `\n⚡ _Selesai mengecek status ONT via Real-time Ping._`;
            return { success: true, data: statusMsg };
        } else {
            return { success: false, error: resData.msg || 'Gagal mengecek status ONT massal.' };
        }

    } catch (error) {
        if (error.response?.status === 403) return { success: false, error: 'Token kedaluwarsa. Silakan ambil token baru dari browser.' };
        return { success: false, error: error.message };
    }
}

// 4. MONITORING GANGGUAN MASSAL OLT OPEN (GLOBAL)
async function scrapeGamasOlt() {
    const jwtToken = process.env.NISA_TOKEN;
    if (!jwtToken) return { success: false, error: 'Token NISA belum diisi di file .env!' };

    try {
        const dcParam = Date.now();
        const response = await axios.get('https://nisa.myrepublic.net.id/api/transaction/massproblem/getdata', {
            params: {
                '_dc': dcParam, 'tmas_area_id': '', 'tmas_massproblem_no': '', 'tmas_start_date': '', 'tmas_end_date': '',
                'tmas_category': '', 'tmas_category_problem': '', 'ftmad_cid': '', 'bxmq_clusters': '', 'bxmq_hostname': '',
                'tmas_status': '1', 'trxType': '1', 'tmas_is_pre_massproblem': '0', 'page': '1', 'start': '0', 'limit': '150'
            },
            headers: getBaseHeaders(jwtToken)
        });

        const resData = response.data;
        if (resData && resData.success === true) {
            const listGamas = resData.data || [];
            if (listGamas.length === 0) {
                return { success: true, data: `🟢 *MONITORING GANGGUAN OLT OPEN*\n\nStatus: *Aman*\nAlhamdulillah, tidak terdeteksi adanya gangguan massal aktif (Open) saat ini.` };
            }

            let laporan = `🚨 *MONITORING GANGGUAN MASSAL OLT OPEN (NISA)* 🚨\n`;
            laporan += `==================================\n\n`;

            const maxDisplay = Math.min(listGamas.length, 8);
            for (let i = 0; i < maxDisplay; i++) {
                const olt = listGamas[i];
                laporan += `${i + 1}. 🎫 *Mass Problem No:* \`${olt.tmas_massproblem_no || '-'}\`\n`;
                laporan += `   🖥️ *Host Name:* \`${olt.tmas_link_dtl || '-'}\`\n`;
                laporan += `   📍 *Area:* ${olt.tmas_area_name || '-'}\n`;
                laporan += `   📊 *Status:* ${olt.tmas_status_name === 'close' ? '🟢 CLOSED' : '🔴 OPEN'}\n`;
                laporan += `   🔀 *Type:* ${olt.tmas_type || '-'} (${olt.tmas_remark_name || '-'})\n`;
                laporan += `   📁 *Category:* ${olt.tmas_category_name || '-'}\n`;
                laporan += `   ⚙️ *Problem Category:* ${olt.tmas_category_type_name || '-'}\n`;
                laporan += `   💥 *NE Impact:* ${olt.tmas_ne_name || '-'}\n`;
                laporan += `   📺 *Service Impact:* ${olt.tmas_service_name || '-'}\n`;
                laporan += `   👥 *Impacted CID:* ${olt.tmas_tot_cid || '0'} User\n`;
                laporan += `   📉 *Service Degrade(%):* ${olt.tmas_service_degrade ? `${olt.tmas_service_degrade}%` : '-'}\n`;
                laporan += `   📈 *SLA(%):* ${olt.tmas_sla ? `${olt.tmas_sla}%` : '-'}\n`;
                laporan += `   ⏳ *Hold Time:* ${olt.hold_time || '-'}\n`;
                laporan += `   ⏱️ *Aging Verify:* ${olt.aging_verify || '-'}\n`;
                laporan += `   🕒 *Aging Ticket:* ${olt.tmas_aging || '-'}\n`;
                laporan += `   📅 *Start Date:* ${olt.tmas_start_date || '-'}\n`;
                laporan += `   ⏰ *Start Time:* ${olt.tmas_start_time || '-'}\n`;
                laporan += `   💡 _Ketik *\.cekmp ${olt.tmas_massproblem_no}* untuk rincian port_\n`;
                laporan += `   ----------------------------------\n`;
            }
            return { success: true, data: laporan };
        } else {
            return { success: false, error: 'Gagal mengambil data lengkap list Gamas OLT.' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 5. MONITORING GANGGUAN MASSAL AREA SEMARANG ONLY
async function scrapeGamasSemarang() {
    const jwtToken = process.env.NISA_TOKEN;
    if (!jwtToken) return { success: false, error: 'Token NISA belum diisi di file .env!' };

    try {
        const dcParam = Date.now();
        const response = await axios.get('https://nisa.myrepublic.net.id/api/transaction/massproblem/getdata', {
            params: {
                '_dc': dcParam, 'tmas_area_id': '', 'tmas_massproblem_no': '', 'tmas_start_date': '', 'tmas_end_date': '',
                'tmas_category': '', 'tmas_category_problem': '', 'ftmad_cid': '', 'bxmq_clusters': '', 'bxmq_hostname': '',
                'tmas_status': '1', 'trxType': '1', 'tmas_is_pre_massproblem': '0', 'page': '1', 'start': '0', 'limit': '150'
            },
            headers: getBaseHeaders(jwtToken)
        });

        const resData = response.data;
        if (resData && resData.success === true) {
            const listGamas = resData.data || [];
            
            const dataSemarang = listGamas.filter(olt => olt.tmas_area_name && olt.tmas_area_name.toUpperCase() === 'SEMARANG');

            if (dataSemarang.length === 0) {
                return { success: true, data: `🟢 *MONITORING GANGGUAN OLT - AREA SEMARANG*\n\nStatus: *Aman*\nAlhamdulillah, tidak ada gangguan massal (MP Open) tingkat OLT di area Semarang saat ini.` };
            }

            let laporan = `🚨 *MONITORING GANGGUAN MASSAL OLT OPEN - SEMARANG* 🚨\n`;
            laporan += `==================================\n\n`;

            dataSemarang.forEach((olt, idx) => {
                const hostName = olt.tmas_link_dtl || '-';
                const statusNama = olt.tmas_status_name === 'close' ? '🟢 CLOSED' : '🔴 OPEN';
                const agingVerify = olt.aging_verify || '-';
                const agingTicket = olt.tmas_aging || '-';
                const sla = olt.tmas_sla ? `${olt.tmas_sla}%` : '-';
                const holdTime = olt.hold_time || '-';
                const impactedCid = olt.tmas_tot_cid || '0';
                const serviceDegrade = olt.tmas_service_degrade ? `${olt.tmas_service_degrade}%` : '-';
                const mpNo = olt.tmas_massproblem_no || '-';
                const area = olt.tmas_area_name || '-';
                const category = olt.tmas_category_name || '-';
                const probCategory = olt.tmas_category_type_name || '-';
                const neImpact = olt.tmas_ne_name || '-';
                const serviceImpact = olt.tmas_service_name || '-';
                const startDate = olt.tmas_start_date || '-';
                const startTime = olt.tmas_start_time || '-';
                const endDate = olt.tmas_end_date || '-';
                const endTime = olt.tmas_end_time || '-';
                const createdBy = olt.tmas_create_user || '-';
                const alarmNmsDate = olt.tmas_date_alarm_nms && olt.tmas_time_alarm_nms ? `${olt.tmas_date_alarm_nms} ${olt.tmas_time_alarm_nms}` : '-';
                const typeGamas = olt.tmas_type || '-';
                const detailProgress = olt.tmas_remark_name || '-';

                laporan += `${idx + 1}. 🎫 *Mass Problem No:* \`${mpNo}\`\n`;
                laporan += `   🖥️ *Host Name:* \`${hostName}\`\n`;
                laporan += `   📍 *Area:* ${area}\n`;
                laporan += `   📊 *Status:* ${statusNama}\n`;
                laporan += `   🔀 *Type:* ${typeGamas} (${detailProgress})\n`;
                laporan += `   📁 *Category:* ${category}\n`;
                laporan += `   ⚙️ *Problem Category:* ${probCategory}\n`;
                laporan += `   💥 *NE Impact:* ${neImpact}\n`;
                laporan += `   📺 *Service Impact:* ${serviceImpact}\n`;
                laporan += `   👥 *Impacted CID:* ${impactedCid} User\n`;
                laporan += `   📉 *Service Degrade(%):* ${serviceDegrade}\n`;
                laporan += `   📈 *SLA(%):* ${sla}\n`;
                laporan += `   ⏳ *Hold Time:* ${holdTime}\n`;
                laporan += `   ⏱️ *Aging Verify:* ${agingVerify}\n`;
                laporan += `   🕒 *Aging Ticket:* ${agingTicket}\n`;
                laporan += `   📅 *Start Date:* ${startDate}\n`;
                laporan += `   ⏰ *Start Time:* ${startTime}\n`;
                laporan += `   │📆 *End Date:* ${endDate}\n`;
                laporan += `   ⌛ *End Time:* ${endTime}\n`;
                laporan += `   🚨 *Alarm NMS Date:* ${alarmNmsDate}\n`;
                laporan += `   👤 *Created by:* ${createdBy}\n`;
                laporan += `   💡 _Ketik *\.cekmp ${mpNo}* untuk rincian port_\n`;
                laporan += `   ----------------------------------\n`;
            });

            return { success: true, data: laporan };
        } else {
            return { success: false, error: 'Gagal mengambil data list Gamas OLT.' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 6. DETECT & SCRAPE DETAIL PORT BERDASARKAN NOMOR MP (UX FRIENDLY UNTUK TEKNISI)
async function cekDetailMp(inputMp) {
    const jwtToken = process.env.NISA_TOKEN;
    if (!jwtToken) return { success: false, error: 'Token NISA belum diisi di file .env!' };

    try {
        const dcParam = Date.now();
        let tmasId = inputMp.trim();

        // JIKA INPUT ADALAH STRIP NOMOR MP (Contoh: MP2026060263)
        if (tmasId.toUpperCase().startsWith('MP')) {
            console.log(`[Scraper] Mencari tmas_id untuk Nomor MP: ${tmasId}...`);
            const listResponse = await axios.get('https://nisa.myrepublic.net.id/api/transaction/massproblem/getdata', {
                params: {
                    '_dc': dcParam, 'tmas_status': '1', 'trxType': '1', 'tmas_is_pre_massproblem': '0', 'page': '1', 'start': '0', 'limit': '150'
                },
                headers: getBaseHeaders(jwtToken)
            });

            const allGamas = listResponse.data?.data || [];
            const matchedMp = allGamas.find(m => m.tmas_massproblem_no && m.tmas_massproblem_no.toUpperCase() === tmasId.toUpperCase());

            if (!matchedMp) {
                return { success: false, error: `Nomor MP *${tmasId}* tidak ditemukan di daftar MP Open aktif saat ini.` };
            }
            tmasId = matchedMp.tmas_id; // Mapping otomatis ke ID Angka internal
        }

        // AKSI TEMBAK DETAIL PORT REAL-TIME
        console.log(`[Scraper] Menembak detail port untuk tmas_id: ${tmasId}...`);
        const response = await axios.get('https://nisa.myrepublic.net.id/api/transaction/massproblem/massproblemdportdtl', {
            params: { '_dc': dcParam, 'tmas_id': tmasId, 'tmas_device_name': '' },
            headers: getBaseHeaders(jwtToken)
        });

        const resData = response.data;
        if (resData && resData.success === true) {
            const listPort = resData.data || [];
            if (listPort.length === 0) {
                return { success: true, data: `ℹ️ Tidak ditemukan rincian detail data Port OLT untuk MP *${inputMp.toUpperCase()}*.` };
            }

            let detailMsg = `🔍 *DETAIL GANGGUAN PORT OLT (${listPort[0].tmas_massproblem_no || inputMp.toUpperCase()})* 🔍\n`;
            detailMsg += `==================================\n\n`;

            listPort.forEach((port, idx) => {
                detailMsg += `${idx + 1}. ⚙️ *OLT Name:* \`${port.tmad_olt_name || port.name || '-'}\`\n`;
                detailMsg += `   📍 *F / S / P:* ${port.tmad_frame || port.olt_frame || 0} / ${port.tmad_slot || port.olt_slot || 0} / ${port.tmad_port || port.olt_port || 0}\n`;
                detailMsg += `   🏙️ *Cluster Terdampak:* ${port.tmad_cluster_name || '-'}\n`;
                detailMsg += `   🕒 *Happen Time:* ${port.tmad_alert_happentime || '-'}\n`;
                detailMsg += `   🆔 *Alarm ID:* \`${port.tmad_alarm_id || '-'}\`\n`;
                detailMsg += `   ----------------------------------\n`;
            });

            return { success: true, data: detailMsg };
        } else {
            return { success: false, error: resData.msg || 'Gagal memuat rincian detail port MP.' };
        }
    } catch (error) {
        if (error.response?.status === 403) return { success: false, error: 'Token NISA kedaluwarsa. Silakan perbarui token Anda.' };
        return { success: false, error: error.message };
    }
}

module.exports = { 
    scrapeNisa, 
    cekDetailTiket, 
    cekStatusFat,
    temukanTiketDone,
    scrapeGamasOlt,
    scrapeGamasSemarang,
    cekDetailMp
};
