function normalizePhone(phone: string): string {
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (!p.startsWith("62")) p = "62" + p;
  return p;
}

export async function sendWhatsAppOTP(phone: string, code: string): Promise<void> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    console.log(`[DEV] OTP untuk ${phone}: ${code}`);
    return;
  }
  const target = normalizePhone(phone);
  const message =
    `🔑 Kode OTP RUTE Anda: *${code}*\n\n` +
    `Berlaku selama 5 menit. Jangan berikan kode ini kepada siapapun.\n\n` +
    `Jika Anda tidak mendaftar di RUTE, abaikan pesan ini.`;
  const body = new URLSearchParams({ target, message, countryCode: "62" });
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonnte error ${res.status}: ${text}`);
  }
}
