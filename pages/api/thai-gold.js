// /pages/api/thai-gold.js
export default async function handler(req, res) {
  try {
    const resp = await fetch("https://www.goldtraders.or.th/", {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      },
    });
    const html = await resp.text();
    const clean = html.replace(/\s+/g, " ");

    // จำกัดบริบทให้แคบลง: ช่วงข้อความที่มีหัวข้อ "ราคาทองตามประกาศสมาคมค้าทองคำ"
    const blockMatch = clean.match(/ราคาทองตามประกาศสมาคมค้าทองคำ[^]*?ราคาทองทุกชนิด|ราคาทองตามประกาศสมาคมค้าทองคำ[^]*?<\/table>/i);
    const block = blockMatch ? blockMatch[0] : clean;

    // จับเลขรูปแบบ 2–3 หลัก + คอมมา + 3 หลัก (เช่น 51,900 หรือ 51,900.00)
    const rxNum = /(\d{2,3},\d{3}(?:\.\d+)?)/;

    const bidMatch = block.match(new RegExp(`ทองคำแท่ง[^]*?รับซื้อ[^]*?${rxNum.source}`, "i"));
    const askMatch = block.match(new RegExp(`ทองคำแท่ง[^]*?ขายออก[^]*?${rxNum.source}`, "i"));

    const bid = bidMatch ? Number(bidMatch[1].replace(/,/g, "")) : null;
    const ask = askMatch ? Number(askMatch[1].replace(/,/g, "")) : null;

    // sanity check: ช่วงสเปรด 0–500 บาท (สมาคมส่วนใหญ่ต่างกัน ~50–200)
    if (!bid || !ask || ask - bid < 0 || ask - bid > 500) {
      return res.status(503).json({ ok: false, reason: "parse_failed" });
    }

    return res.status(200).json({
      ok: true,
      source: "goldtraders.or.th",
      type: "thai_official_96_5",
      bid, ask,
      updated: new Date().toLocaleTimeString("th-TH"),
      currency: "THB/baht-gold",
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
