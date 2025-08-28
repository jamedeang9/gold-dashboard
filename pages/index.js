import React, { useState, useEffect } from "react";
import Head from "next/head";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export default function GoldDashboard() {
  // ----- states -----
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({
    date: "",
    price: "",
    weight: 1,
    block: "",
    shop: "",
  });
  const [goldPricePerOunce, setGoldPricePerOunce] = useState(null);

  // สมาคมไทย 96.5%
  const [official, setOfficial] = useState({ bid: 0, ask: 0, updated: null });

  // แหล่งราคา: thai_official | thai965 | spot | manual
  const [priceSource, setPriceSource] = useState("thai_official");
  const [manualPrice, setManualPrice] = useState("");

  // สำหรับโหมดแก้ไขแถว
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    date: "",
    price: "",
    weight: 1,
    block: "",
    shop: "",
  });

  // ----- constants -----
  const GRAM_PER_OUNCE = 31.1035;
  const GRAM_PER_THAI_BAHT = 15.244;

  // ----- fetches -----
  // Spot price (GoldAPI)
  useEffect(() => {
    const fetchGoldPrice = async () => {
      try {
        const res = await fetch("https://www.goldapi.io/api/XAU/THB", {
          headers: { "x-access-token": process.env.NEXT_PUBLIC_GOLD_API_KEY },
          cache: "no-store",
        });
        const data = await res.json();
        if (data && data.price) setGoldPricePerOunce(data.price);
      } catch (e) {
        console.error("GoldAPI fetch error:", e);
      }
    };
    fetchGoldPrice();
    const t = setInterval(fetchGoldPrice, 60000);
    return () => clearInterval(t);
  }, []);

  // Official Thai (goldtraders.or.th) via Next API route
  useEffect(() => {
    const fetchOfficial = async () => {
      try {
        const r = await fetch("/api/thai-gold?ts=" + Date.now());
        const j = await r.json();
        if (j && j.ok)
          setOfficial({ bid: j.bid || 0, ask: j.ask || 0, updated: j.updated || null });
      } catch (e) {
        console.error("Thai official fetch error:", e);
      }
    };
    fetchOfficial();
    const t = setInterval(fetchOfficial, 60000);
    return () => clearInterval(t);
  }, []);

  // localStorage persistence
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gold_records_v1");
      if (saved) setRecords(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("gold_records_v1", JSON.stringify(records));
    } catch {}
  }, [records]);

  // ----- handlers -----
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAdd = () => {
    if (!form.date || !form.price) return alert("กรุณากรอก 'วันที่ซื้อ' และ 'ราคาซื้อ'");
    setRecords([...records, { ...form, id: Date.now() }]);
    setForm({ date: "", price: "", weight: 1, block: "", shop: "" });
  };

  const handleDelete = (id) => setRecords((prev) => prev.filter((r) => r.id !== id));
  const handleClearAll = () => {
    if (confirm("ลบรายการทั้งหมดใช่ไหม?")) setRecords([]);
  };

  // edit row
  const startEdit = (r) => {
    setEditingId(r.id);
    setEditDraft({
      date: r.date,
      price: r.price,
      weight: r.weight,
      block: r.block,
      shop: r.shop,
    });
  };
  const changeEditDraft = (e) =>
    setEditDraft({ ...editDraft, [e.target.name]: e.target.value });
  const saveEdit = () => {
    setRecords((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...editDraft } : r)));
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  // ----- price conversions -----
  const priceSpotBahtGold = goldPricePerOunce
    ? (goldPricePerOunce / GRAM_PER_OUNCE) * GRAM_PER_THAI_BAHT
    : 0;
  const priceThai965Calc = priceSpotBahtGold ? priceSpotBahtGold * (0.965 / 0.9999) : 0;

  const currentPrice =
    priceSource === "thai_official"
      ? official.ask || 0
      : priceSource === "thai965"
      ? priceThai965Calc
      : priceSource === "spot"
      ? priceSpotBahtGold
      : Number(manualPrice || 0);

  const totalProfit = records.reduce((sum, r) => {
    const buy = r.price * r.weight + Number(r.block || 0);
    const current = (currentPrice || 0) * r.weight;
    return sum + (current - buy);
  }, 0);

  // CSV export/import
  const exportCSV = () => {
    const header = ["date", "price", "weight", "block", "shop"].join(",");
    const rows = records.map((r) =>
      [r.date, r.price, r.weight, r.block, `"${(r.shop || "").replace(/"/g, '""')}"`].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gold-records.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = async (file) => {
    const text = await file.text();
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
    const cols = headerLine.split(",");
    const idx = (name) => cols.indexOf(name);
    const recs = lines.map((line) => {
      const cells = [];
      let cur = "",
        inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQ = !inQ;
          continue;
        }
        if (ch === "," && !inQ) {
          cells.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      cells.push(cur);
      return {
        id: Date.now() + Math.random(),
        date: cells[idx("date")] || "",
        price: Number(cells[idx("price")] || 0),
        weight: Number(cells[idx("weight")] || 0),
        block: Number(cells[idx("block")] || 0),
        shop: cells[idx("shop")] || "",
      };
    });
    setRecords(recs);
  };

  // ----- UI -----
  return (
    <div style={{ padding: 16, fontFamily: "sans-serif", maxWidth: 920, margin: "0 auto" }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Gold Investment Dashboard</title>
      </Head>

      <h1 style={{ fontSize: 24, fontWeight: "bold" }}>💰 Gold Investment Dashboard</h1>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>แหล่งราคา:</b>
          <label>
            <input
              type="radio"
              name="src"
              value="thai_official"
              checked={priceSource === "thai_official"}
              onChange={() => setPriceSource("thai_official")}
            />{" "}
            สมาคม (96.5%)
          </label>
        <label>
            <input
              type="radio"
              name="src"
              value="thai965"
              checked={priceSource === "thai965"}
              onChange={() => setPriceSource("thai965")}
            />{" "}
            ไทย 96.5% (คำนวณ)
          </label>
          <label>
            <input
              type="radio"
              name="src"
              value="spot"
              checked={priceSource === "spot"}
              onChange={() => setPriceSource("spot")}
            />{" "}
            Spot 99.99%
          </label>
          <label>
            <input
              type="radio"
              name="src"
              value="manual"
              checked={priceSource === "manual"}
              onChange={() => setPriceSource("manual")}
            />{" "}
            Manual
          </label>
          {priceSource === "manual" && (
            <input
              type="number"
              placeholder="ใส่ราคาปัจจุบัน (บาท/บาททอง)"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              style={{ width: 220 }}
            />
          )}
        </div>

        <p style={{ marginTop: 8 }}>
          <b>ราคาทองปัจจุบัน:</b>{" "}
          {currentPrice ? currentPrice.toFixed(2) : "กำลังโหลด..."} ฿ (บาททอง)
        </p>
        <p style={{ color: "#666" }}>
          สมาคม (รับซื้อ/ขายออก): {official.bid || "-"} / {official.ask || "-"} ฿
          {official.updated ? ` | เวลา ${official.updated} น.` : ""}
        </p>
        <p style={{ color: "#666" }}>
          คำนวณ 96.5%: {priceThai965Calc ? priceThai965Calc.toFixed(2) : "-"} ฿ | Spot 99.99%:{" "}
          {priceSpotBahtGold ? priceSpotBahtGold.toFixed(2) : "-"} ฿
        </p>

        <p>
          <b>จำนวนรายการซื้อ:</b> {records.length}
        </p>
        <p>
          <b>กำไร/ขาดทุนรวม:</b>{" "}
          <span style={{ color: totalProfit >= 0 ? "green" : "red" }}>
            {totalProfit.toFixed(2)} ฿
          </span>
        </p>
      </div>

      <div style={{ marginTop: 20 }}>
        <h2>เพิ่มรายการซื้อ</h2>
        <input type="date" name="date" value={form.date} onChange={handleChange} style={{ marginRight: 8, marginTop: 8 }} />
        <input type="number" name="price" value={form.price} onChange={handleChange} placeholder="ราคาซื้อ" style={{ marginRight: 8, marginTop: 8, width: 120 }} />
        <input type="number" name="weight" value={form.weight} onChange={handleChange} placeholder="น้ำหนัก (บาททอง)" style={{ marginRight: 8, marginTop: 8, width: 160 }} />
        <input type="number" name="block" value={form.block} onChange={handleChange} placeholder="ค่า Block" style={{ marginRight: 8, marginTop: 8, width: 120 }} />
        <input type="text" name="shop" value={form.shop} onChange={handleChange} placeholder="ร้าน" style={{ marginRight: 8, marginTop: 8, width: 160 }} />
        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button onClick={handleAdd} style={{ marginTop: 8 }}>เพิ่มรายการ</button>
          <button onClick={handleClearAll} style={{ marginTop: 8, color: "#b91c1c" }}>ล้างตารางทั้งหมด</button>
          <button onClick={exportCSV} style={{ marginTop: 8 }}>Export CSV</button>
          <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0])} style={{ marginTop: 8 }} />
        </div>
      </div>

      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <h2>ตารางข้อมูล</h2>
        <table border="1" cellPadding="5" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>วันที่</th>
              <th>ราคาซื้อ</th>
              <th>น้ำหนัก</th>
              <th>Block</th>
              <th>ร้าน</th>
              <th>กำไร/ขาดทุน</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const buy = r.price * r.weight + Number(r.block || 0);
              const current = (currentPrice || 0) * r.weight;
              const profit = current - buy;
              const isEditing = editingId === r.id;

              return (
                <tr key={r.id}>
                  <td>
                    {isEditing ? (
                      <input type="date" name="date" value={editDraft.date} onChange={changeEditDraft} />
                    ) : (
                      r.date
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input type="number" name="price" value={editDraft.price} onChange={changeEditDraft} />
                    ) : (
                      r.price
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input type="number" name="weight" value={editDraft.weight} onChange={changeEditDraft} />
                    ) : (
                      r.weight
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input type="number" name="block" value={editDraft.block} onChange={changeEditDraft} />
                    ) : (
                      r.block
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input type="text" name="shop" value={editDraft.shop} onChange={changeEditDraft} />
                    ) : (
                      r.shop
                    )}
                  </td>
                  <td style={{ color: profit >= 0 ? "green" : "red" }}>{profit.toFixed(2)}</td>
                  <td>
                    {isEditing ? (
                      <>
                        <button onClick={saveEdit} style={{ marginRight: 6 }}>บันทึก</button>
                        <button onClick={cancelEdit}>ยกเลิก</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(r)} style={{ marginRight: 6 }}>แก้ไข</button>
                        <button onClick={() => handleDelete(r.id)} style={{ color: "#b91c1c" }}>ลบ</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", color: "#666" }}>
                  ยังไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20 }}>
        <h2>กราฟราคาซื้อ vs ราคาตลาด</h2>
        <div style={{ width: "100%", height: 300, border: "1px dashed #ddd", borderRadius: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={records.map((r) => ({
                date: r.date,
                buy: Number(r.price),
                market: currentPrice || 0,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="buy" name="ราคาซื้อ" />
              <Line type="monotone" dataKey="market" name="ราคาตลาด" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
