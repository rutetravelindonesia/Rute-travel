export interface Destinasi {
  nama: string;
  kota: string;
  provinsi: "Kalimantan Timur" | "Kalimantan Utara";
  tagline: string;
  jarak: string;
  photo: string;
  grad: string;
  highlight?: string;
}

export const SEMUA_DESTINASI: Destinasi[] = [
  // ── KALIMANTAN TIMUR ──────────────────────────────────────────
  {
    nama: "Pulau Derawan",
    kota: "Berau",
    provinsi: "Kalimantan Timur",
    tagline: "Surga bawah laut & penyu hijau",
    jarak: "~12 jam dari Samarinda",
    highlight: "Diving • Snorkeling • Penyu",
    photo: "https://www.tripsavvy.com/thmb/-4QBWFr6MYd992GR2wnslfn4HiE=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/indonesia--derawan-island--east-kalimantan-136506641-273f023c9b68482697fe6efa5112ed92.jpg",
    grad: "linear-gradient(135deg, #0f7b8c 0%, #155e75 60%, #1e3a5f 100%)",
  },
  {
    nama: "Danau Labuan Cermin",
    kota: "Berau",
    provinsi: "Kalimantan Timur",
    tagline: "Danau air tawar & asin dua lapis",
    jarak: "~14 jam dari Samarinda",
    highlight: "Berenang • Kayak • Fotografi",
    photo: "https://media-cdn.tripadvisor.com/media/photo-o/2b/bd/99/89/danau-labuan-cermin-berlokasi.jpg",
    grad: "linear-gradient(135deg, #0d9488 0%, #0f766e 60%, #134e4a 100%)",
  },
  {
    nama: "Pulau Maratua",
    kota: "Berau",
    provinsi: "Kalimantan Timur",
    tagline: "Pantai bounty yang memukau",
    jarak: "~13 jam dari Samarinda",
    highlight: "Pantai • Selam • Whale Shark",
    photo: "https://www.kalimantantours.com/img/bounty-beach-borneo.jpg",
    grad: "linear-gradient(135deg, #0369a1 0%, #075985 60%, #0c4a6e 100%)",
  },
  {
    nama: "Kepulauan Sangalaki",
    kota: "Berau",
    provinsi: "Kalimantan Timur",
    tagline: "Titik selam manta ray terbaik",
    jarak: "~13 jam dari Samarinda",
    highlight: "Manta Ray • Diving • Konservasi",
    photo: "https://awsimages.detik.net.id/community/media/visual/2022/12/22/destinasi-indonesia-yang-vibesnya-film-avatar-2-the-way-of-water-2_169.jpeg?w=700&q=90",
    grad: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 60%, #1e293b 100%)",
  },
  {
    nama: "Pantai Manggar",
    kota: "Balikpapan",
    provinsi: "Kalimantan Timur",
    tagline: "Pantai kota paling populer",
    jarak: "Di Balikpapan",
    highlight: "Pantai • Sunset • Kuliner",
    photo: "https://cdn-strapi.prod.99iddev.net/assets/pantai_manggar_balikpapan_4da7adfe2a.jpg",
    grad: "linear-gradient(135deg, #d97706 0%, #b45309 60%, #92400e 100%)",
  },
  {
    nama: "Bukit Bangkirai",
    kota: "Kutai Kartanegara",
    provinsi: "Kalimantan Timur",
    tagline: "Canopy walk di hutan tropis",
    jarak: "~1 jam dari Balikpapan",
    highlight: "Jembatan Tajuk • Hutan • Treking",
    photo: "https://www.celebes.co/borneo/wp-content/uploads/2021/11/Canopy-Bridge-Bukit-Bangkirai-Yang-Mempesona-Dan-Menarik-Di-Kutai-Kartanegara.jpg",
    grad: "linear-gradient(135deg, #16a34a 0%, #15803d 60%, #14532d 100%)",
  },
  {
    nama: "Sungai Mahakam",
    kota: "Samarinda",
    provinsi: "Kalimantan Timur",
    tagline: "Pesisir budaya suku Dayak",
    jarak: "Di Samarinda",
    highlight: "River Cruise • Budaya • Irrawaddy Dolphin",
    photo: "https://cdn.britannica.com/36/110236-004-BBA5D1F3/Housing-Tenggarong-Mahakam-River-Indonesia-East-Kalimantan.jpg",
    grad: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 60%, #4c1d95 100%)",
  },
  {
    nama: "Pulau Beras Basah",
    kota: "Bontang",
    provinsi: "Kalimantan Timur",
    tagline: "Pulau mini dengan air jernih",
    jarak: "~3 jam dari Samarinda",
    highlight: "Pantai • Snorkeling • Piknik",
    photo: "https://media-cdn.tripadvisor.com/media/photo-o/09/03/5c/53/beras-basah-beach.jpg",
    grad: "linear-gradient(135deg, #0891b2 0%, #0e7490 60%, #164e63 100%)",
  },
  {
    nama: "Pantai Melawai",
    kota: "Balikpapan",
    provinsi: "Kalimantan Timur",
    tagline: "Menikmati sunset di tepi kota",
    jarak: "Di Balikpapan",
    highlight: "Sunset • Kuliner • Bersantai",
    photo: "https://sp-ao.shortpixel.ai/client/to_auto,q_glossy,ret_img,w_585,h_390/https://www.wisatadanhotelmurah.com/storage/2016/01/Pantai-Manggar-balikpapan-300x200.jpg",
    grad: "linear-gradient(135deg, #f59e0b 0%, #d97706 60%, #92400e 100%)",
  },

  // ── KALIMANTAN UTARA ─────────────────────────────────────────
  {
    nama: "Pantai Amal",
    kota: "Tarakan",
    provinsi: "Kalimantan Utara",
    tagline: "Pantai kebanggaan Kota Tarakan",
    jarak: "~2 jam via udara dari Samarinda",
    highlight: "Pantai • Mangrove • Kuliner",
    photo: "https://awsimages.detik.net.id/community/media/visual/2025/02/18/pantai-tanah-kuning_169.jpeg?w=620",
    grad: "linear-gradient(135deg, #059669 0%, #047857 60%, #064e3b 100%)",
  },
  {
    nama: "TN Kayan Mentarang",
    kota: "Malinau",
    provinsi: "Kalimantan Utara",
    tagline: "Hutan hujan terluas Kalimantan",
    jarak: "~6 jam dari Tarakan",
    highlight: "Trekking • Wildlife • Dayak",
    photo: "https://cdn.idntimes.com/content-images/community/2023/01/whatsapp-image-2023-01-26-at-142550-df768e95daae76c9da8019d3a42d016a-eb8413327cbfbb4217ede62715b620a5_600x400.jpeg",
    grad: "linear-gradient(135deg, #15803d 0%, #166534 60%, #14532d 100%)",
  },
  {
    nama: "Pantai Tanah Kuning",
    kota: "Bulungan",
    provinsi: "Kalimantan Utara",
    tagline: "Pantai tepi hutan yang tenang",
    jarak: "~1.5 jam dari Tanjung Selor",
    highlight: "Pantai • Matahari Terbenam • Alam",
    photo: "https://awsimages.detik.net.id/community/media/visual/2025/02/18/pantai-tanah-kuning_169.jpeg?w=700",
    grad: "linear-gradient(135deg, #b45309 0%, #92400e 60%, #78350f 100%)",
  },
];

export const DESTINASI_BERANDA = SEMUA_DESTINASI.slice(0, 5);
