// ====================================================================
// Variabel Global
// ====================================================================
let beneficiariesData = []; // Data mentah dari Excel (Global)
let filteredData = [];      // Data yang saat ini ditampilkan setelah filter Wilayah/RW/RT (Global)

// Ambil elemen DOM sekali (untuk menghindari pencarian berulang)
const domElements = {
    fileInput: document.getElementById('excel-file'),
    fileStatus: document.getElementById('file-status'),
    dataList: document.getElementById('data-list'),
    wilayahFilter: document.getElementById('wilayah-filter'),
    rwFilter: document.getElementById('rw-filter'),
    rtFilter: document.getElementById('rt-filter'),
    searchInput: document.getElementById('search-input'),
    searchButton: document.getElementById('search-btn'),
    feedbackNumeric: document.getElementById('feedback-numeric'),
    feedbackLength: document.getElementById('feedback-length'),
    resetButton: document.getElementById('reset-filter-btn') 
};

// Konstanta
const MIN_SEARCH_LENGTH = 8;
const SLIDE_INTERVAL_MS = 5000;


// ====================================================================
// FUNGSI UTILITY BARU: Mengatur Status, Warna, dan Ikon File
// ====================================================================
function setFileStatus(text, status) {
    const fileStatusElement = document.getElementById('file-status');
    let icon = '';
    
    // Hapus semua kelas status sebelumnya
    fileStatusElement.classList.remove('status-idle', 'status-success', 'status-error');
    
    // Tambahkan kelas status yang sesuai dan tentukan ikon
    if (status === 'success') {
        fileStatusElement.classList.add('status-success');
        icon = '✅ '; // Ikon Ceklis untuk Berhasil
    } else if (status === 'error') {
        fileStatusElement.classList.add('status-error');
        icon = '❌ '; // Ikon X untuk Gagal
    } else {
        // Status Idle (Awal/Memproses)
        fileStatusElement.classList.add('status-idle');
        icon = '⚠️ '; // Ikon Peringatan untuk Idle/Memproses
    }

    // Set teks status dengan ikon di depan
    fileStatusElement.innerHTML = icon + text; // Menggunakan innerHTML karena ada emoji
}


// ====================================================================
// 1. FUNGSI MEMBACA FILE EXCEL (SheetJS)
// ====================================================================
function loadExcel(event) {
    const file = event.target.files[0];
    if (!file) {
        // Jika file dibatalkan (cancel)
        setFileStatus('Unggahan dibatalkan.', 'idle'); 
        return;
    }

    setFileStatus(`File: ${file.name} - Sedang diproses...`, 'idle');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            beneficiariesData = XLSX.utils.sheet_to_json(worksheet);
            
            if (beneficiariesData.length === 0) {
                 setFileStatus(`File dimuat, namun tidak ada data ditemukan.`, 'error');
                 document.getElementById('data-list').innerHTML = '<p>Tidak ada data ditemukan.</p>';
                 return;
            }

            // Status Berhasil (Warna Hijau & Ikon Ceklis)
            setFileStatus(`File: ${file.name} (${beneficiariesData.length} data dimuat).`, 'success');
            
            // ... (Aksi lanjutan lainnya) ...
            populateFilters(beneficiariesData);
            filteredData = beneficiariesData;
            displayDataTable(filteredData);

        } catch (error) {
            console.error("Gagal memproses file Excel:", error);
            // Status Error (Warna Merah & Ikon X)
            setFileStatus('Gagal memproses file Excel. Pastikan format kolom benar.', 'error');
            alert("Terjadi kesalahan saat membaca file Excel. Pastikan nama kolom sudah benar.");
        }
    };
    reader.readAsArrayBuffer(file);
}

// ====================================================================
// 2. FUNGSI MENGISI DROPDOWN FILTER (Wilayah/RW/RT)
// ====================================================================
function populateFilters(data) {
    const wilayahs = new Set();
    const rts = new Set();
    const rws = new Set();
    
    data.forEach(item => {
        // Ambil data untuk Wilayah, RT, dan RW, pastikan dikonversi ke String
        if (item.WILAYAH) wilayahs.add(String(item.WILAYAH));
        if (item.RT) rts.add(String(item.RT));
        if (item.RW) rws.add(String(item.RW));
    });

    // Fungsi helper untuk mengisi select
    const fillSelect = (selectElement, options, defaultText) => {
        selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;
        Array.from(options).sort((a, b) => {
            // Coba urutkan secara numerik jika memungkinkan
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b); // Fallback ke pengurutan string
        }).forEach(value => {
            selectElement.innerHTML += `<option value="${value}">${value}</option>`;
        });
    };

    fillSelect(domElements.wilayahFilter, wilayahs, 'Semua Wilayah');
    fillSelect(domElements.rwFilter, rws, 'Semua RW');
    fillSelect(domElements.rtFilter, rts, 'Semua RT');
    
    // Reset filter pencarian
    domElements.searchInput.value = '';
    // Panggil validasi NIK untuk mereset visual feedback
    validateNIKInput();
}

// ====================================================================
// 3. FUNGSI MENAMPILKAN DATA DALAM TABEL (Termasuk Nomor Urut Otomatis)
// ====================================================================
function displayDataTable(data) {
    if (data.length === 0) {
        domElements.dataList.innerHTML = '<p>Tidak ada data ditemukan untuk kriteria yang anda pilih.</p>';
        return;
    }

    // Pemetaan Nama Kolom (Konstan)
    const HEADER_MAP = {
        'NO': 'No.', // <-- BARU: Nomor Urut (Placeholder di kode)
        'NAMA': 'Nama',
        'ALAMAT_LENGKAP': 'Alamat',
        'JENIS_BANTUAN': 'Jenis Bantuan',
        'WILAYAH': 'Wilayah',
        'RT': 'RT',
        'RW': 'RW',
        'AKSI': 'Navigasi'
    };

    // Daftar kunci yang ingin ditampilkan (dengan 'NO' di awal)
    // NOTE: 'NO' tidak ada di Excel, ini hanya untuk placeholder kolom
    const VISIBLE_KEYS = ['NO', 'NAMA', 'ALAMAT_LENGKAP', 'JENIS_BANTUAN', 'WILAYAH', 'RT', 'RW', 'AKSI'];
    
    let tableHTML = '<table><thead><tr>';
    
    // Mencetak Header Tabel
    VISIBLE_KEYS.forEach(key => {
        const headerText = HEADER_MAP[key] || key; 
        const classAttr = key === 'NO' ? ' class="col-no"' : '';
        tableHTML += `<th${classAttr}>${headerText}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';

    // Isi Baris Tabel (menggunakan index untuk Nomor Urut)
    data.forEach((item, index) => { // <-- Menggunakan index
        
        const rawLink = item.LINK_GPS;
        let navigationUrl = '#';
        let isLinkValid = false;

        // Validasi link GPS
        if (rawLink && String(rawLink).length > 5) { 
            navigationUrl = String(rawLink);
            isLinkValid = true;
        }
        
        tableHTML += `<tr>`;
        
        // Loop melalui kunci untuk mencetak data sesuai urutan
        VISIBLE_KEYS.forEach(key => {
            
            if (key === 'NO') {
                // Kolom 'NO' (Nomor Urut dibuat otomatis: index + 1)
                tableHTML += `<td class="col-no">${index + 1}</td>`;
            } else if (key === 'AKSI') {
                 // Kolom 'AKSI' (Tombol Navigasi)
                 tableHTML += `<td class="action-cell">`;
                 if (isLinkValid) {
                     tableHTML += `<a href="${navigationUrl}" target="_blank" class="btn-map-link">
                                     <span class="location-icon">📍</span> Navigasi
                                   </a>`;
                 } else {
                     tableHTML += `<span style="color: red;">Link Error</span>`;
                 }
                 tableHTML += '</td>';
            } else {
                 // Kolom data biasa
                 const cellValue = item[key] !== undefined && item[key] !== null ? item[key] : 'N/A';
                 tableHTML += `<td>${cellValue}</td>`;
            }
        });
        
        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table>';
    domElements.dataList.innerHTML = tableHTML;
}

// ====================================================================
// 4. FUNGSI FILTER DATA (Wilayah/RW/RT)
// ====================================================================
function filterData() {
    // Ambil nilai filter
    const selectedWilayah = domElements.wilayahFilter.value;
    const selectedRT = domElements.rtFilter.value;
    const selectedRW = domElements.rwFilter.value;
    
    // Reset input pencarian saat filter diubah
    domElements.searchInput.value = ''; 
    validateNIKInput(); // Reset visual feedback

    // Filter data mentah berdasarkan semua pilihan dropdown
    filteredData = beneficiariesData.filter(item => {
        // Gunakan string kosong jika properti tidak ada untuk memastikan perbandingan yang benar
        const itemWilayah = String(item.WILAYAH || '');
        const itemRT = String(item.RT || '');
        const itemRW = String(item.RW || '');
        
        // Logika Match: True jika filter tidak dipilih ATAU jika nilainya cocok
        const wilayahMatch = !selectedWilayah || itemWilayah === selectedWilayah;
        const rtMatch = !selectedRT || itemRT === selectedRT;
        const rwMatch = !selectedRW || itemRW === selectedRW;
        
        return wilayahMatch && rwMatch && rtMatch;
    });

    // Tampilkan data yang sudah difilter (dengan penomoran ulang otomatis)
    displayDataTable(filteredData);
}

// ====================================================================
// 5. FUNGSI PENCARIAN KHUSUS NIK (Global)
// ====================================================================
function searchTable() {
    const searchTerm = domElements.searchInput.value.toLowerCase().trim();
    
    // 1. Pengecekan Input Kosong
    if (searchTerm === '') {
        // Jika kosong, kembalikan ke hasil filter Wilayah/RW/RT saat ini
        displayDataTable(filteredData);
        return;
    }

    // 2. Cek Validasi Kritis (Hanya Angka dan Panjang Min)
    const isNumeric = /^\d+$/.test(searchTerm);
    const isCorrectLength = searchTerm.length >= MIN_SEARCH_LENGTH;

    if (!isNumeric || !isCorrectLength) {
        // Alert hanya dipicu jika tombol search diklik dan syarat belum terpenuhi
        alert(`❌ Pencarian Gagal.\n\nPastikan NIK hanya berisi angka dan memiliki minimal ${MIN_SEARCH_LENGTH} digit.`);
        // Tampilkan hasil filter terakhir
        displayDataTable(filteredData); 
        return;
    }

    // 3. LOGIKA PENCARIAN NIK GLOBAL
    // Cari di SELURUH DATA MENTAH (beneficiariesData), ABAIKAN filter Wilayah
    const searchResults = beneficiariesData.filter(item => 
        (item.NIK && String(item.NIK).includes(searchTerm))
    );
    
    // 4. Tampilkan Hasil
    // Penomoran urut akan di-reset untuk hasil pencarian ini
    displayDataTable(searchResults);

    // 5. Notifikasi Hasil Pencarian
    if (searchResults.length === 0) {
         alert(`⚠️ NIK "${searchTerm}" tidak ditemukan di seluruh data.`);
    }
}

// ====================================================================
// 6. FUNGSI VALIDASI NIK REAL-TIME
// ====================================================================
function validateNIKInput() {
    const value = domElements.searchInput.value;
    
    // Kriteria 1: Hanya berisi angka (atau kosong)
    const isNumeric = /^\d*$/.test(value); 
    
    // Kriteria 2: Panjang minimal 8 digit
    const isCorrectLength = value.length >= MIN_SEARCH_LENGTH;

    // Helper untuk update feedback
    const updateFeedback = (element, isValid, text) => {
        element.classList.toggle('invalid', !isValid);
        element.classList.toggle('valid', isValid);
        element.innerHTML = `<span class="icon">${isValid ? '✓' : '❌'}</span> ${text}`;
    };

    // --- LOGIKA NUMERIK ---
    const numericValid = isNumeric && value.length > 0;
    updateFeedback(domElements.feedbackNumeric, numericValid, '1. Hanya berisi angka');
    
    // --- LOGIKA PANJANG ---
    const lengthValid = numericValid && isCorrectLength;
    updateFeedback(domElements.feedbackLength, lengthValid, `2. Minimal ${MIN_SEARCH_LENGTH} digit`);
}

// ====================================================================
// 7. FUNGSI RESET FILTER
// ====================================================================
function resetFilters() {
    // Reset nilai semua dropdown ke nilai default ("")
    domElements.wilayahFilter.value = "";
    domElements.rwFilter.value = "";
    domElements.rtFilter.value = "";
    
    // Reset input pencarian dan validasi visual
    domElements.searchInput.value = "";
    validateNIKInput();
    
    // Panggil kembali filterData untuk memuat ulang tabel dengan semua data
    filterData();
}


// ====================================================================
// 8. FUNGSI IMAGE SLIDER
// ====================================================================
function initImageSlider() {
    let slideIndex = 0;
    const sliderContainer = document.getElementById('image-slider-container');
    const slides = sliderContainer ? sliderContainer.querySelectorAll('.slide') : [];
    const dotsContainer = document.querySelector('.slider-dots');
    let slideIntervalTimeout;

    if (slides.length === 0) return;

    // --- Generate dots ---
    slides.forEach((_, index) => {
        const dot = document.createElement('span');
        dot.classList.add('dot');
        dot.addEventListener('click', () => currentSlide(index));
        dotsContainer.appendChild(dot);
    });

    const dots = document.querySelectorAll('.dot');

    // --- Fungsionalitas utama slider ---
    function showSlides(n) {
        if (n !== undefined) {
            slideIndex = n;
        } else {
            slideIndex++;
        }

        if (slideIndex >= slides.length) slideIndex = 0;
        if (slideIndex < 0) slideIndex = slides.length - 1;

        slides.forEach(slide => slide.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));

        slides[slideIndex].classList.add('active');
        dots[slideIndex].classList.add('active');

        clearTimeout(slideIntervalTimeout);
        slideIntervalTimeout = setTimeout(showSlides, SLIDE_INTERVAL_MS);
    }

    function currentSlide(n) {
        showSlides(n);
    }

    // --- Mulai slider langsung saat halaman dibuka ---
    showSlides(0);
}


// ====================================================================
// 9. EVENT LISTENERS UTAMA (DOMContentLoaded)
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Event listener untuk upload file Excel
    domElements.fileInput.addEventListener('change', loadExcel);

    // 2. Event listener untuk Filter Dropdown
    domElements.wilayahFilter.addEventListener('change', filterData);
    domElements.rwFilter.addEventListener('change', filterData);
    domElements.rtFilter.addEventListener('change', filterData);

    // 3. Event listener untuk Tombol Reset
    domElements.resetButton.addEventListener('click', resetFilters);

    // 4. Event listener untuk Validasi NIK Real-Time (Visual)
    domElements.searchInput.addEventListener('input', validateNIKInput);
    domElements.searchInput.addEventListener('input', liveSearchNIK);

    
    // 5. Event listener untuk Tombol Search
    domElements.searchButton.addEventListener('click', searchTable);

    // 6. Event listener untuk tombol Enter di search input
    domElements.searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchTable();
            e.preventDefault(); 
        }
    });

    // Inisialisasi fungsi-fungsi awal
    validateNIKInput(); // Panggil untuk menampilkan kondisi awal feedback
    initImageSlider(); // Memulai slider
});

// ====================================================================
// 10.EVENT LISTENERS UTAMA (DOMContentLoaded)
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    // ... (Kode event listeners) ...

    // Set status awal saat halaman dimuat
    setFileStatus('Belum ada file dipilih.', 'idle'); 
    
    // ... (Kode inisialisasi lainnya) ...
});

// ====================================================================
// 11. FUNGSI LIVE SEARCHBAR NIK
// ====================================================================
function liveSearchNIK() {
    const value = domElements.searchInput.value.trim();

    // Jika input kosong → tampilkan semua data yang sudah difilter (Wilayah/RW/RT)
    if (value === "") {
        displayDataTable(filteredData);
        return;
    }

    // Hanya izinkan angka (guna tetap konsisten dengan validasi Anda)
    if (!/^\d+$/.test(value)) return;

    // Lakukan pencarian partial match di seluruh data penduduk
    const results = beneficiariesData.filter(item => 
        item.NIK && String(item.NIK).includes(value)
    );

    displayDataTable(results);
}