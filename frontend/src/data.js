export const seedArticles = [
  { id: "DRB-BRT-007", name: "Royal Maroon Bridal Lehnga", category: "Bridal Wear", price: 4500, minOrder: 20000, status: "Available", photo: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80", color: "rose" },
  { id: "DRB-BRT-012", name: "Ivory Gold Walima Gown", category: "Bridal Wear", price: 5200, minOrder: 25000, status: "Booked", photo: "https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&w=800&q=80", color: "cream" },
  { id: "DRB-PRT-023", name: "Emerald Embellished Maxi", category: "Party Wear", price: 2800, minOrder: 12000, status: "Available", photo: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80", color: "green" },
  { id: "DRB-FML-018", name: "Dusty Pink Formal Suit", category: "Formal Wear", price: 2200, minOrder: 8000, status: "Maintenance", photo: "https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?auto=format&fit=crop&w=800&q=80", color: "pink" },
  { id: "DRB-BRT-031", name: "Crimson Velvet Bridal Set", category: "Bridal Wear", price: 6000, minOrder: 30000, status: "Available", photo: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80", color: "red" },
  { id: "DRB-PRT-029", name: "Midnight Blue Pishwas", category: "Party Wear", price: 3500, minOrder: 15000, status: "Booked", photo: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=800&q=80", color: "blue" },
].map((article) => ({
  ...article,
  priceMin: Math.max(1000, article.price - 500),
  priceMax: article.price + 500,
}));

export const seedCustomers = [
  { id: "CUS-1042", name: "Ayesha Khan", phone: "+92 300 1234567", phone2: "", address: "Gulberg III", city: "Lahore", cnic: "35202-•••••••-4", bookings: 3, due: 2500 },
  { id: "CUS-1041", name: "Maham Ali", phone: "+92 321 7654321", phone2: "", address: "Model Town", city: "Lahore", cnic: "35202-•••••••-8", bookings: 1, due: 0 },
  { id: "CUS-1040", name: "Sana Fatima", phone: "+92 333 9876543", phone2: "", address: "DHA Phase 5", city: "Lahore", cnic: "35202-•••••••-1", bookings: 2, due: 4000 },
  { id: "CUS-1039", name: "Hira Ahmed", phone: "+92 301 4567890", phone2: "", address: "Johar Town", city: "Lahore", cnic: "35202-•••••••-5", bookings: 4, due: 0 },
];

export const seedBookings = [
  { id: "BK-2026-1084", customer: "Ayesha Khan", phone: "+92 300 1234567", article: "DRB-BRT-007", articleName: "Royal Maroon Bridal Lehnga", delivery: "2026-10-31", returnDate: "2026-11-03", amount: 4500, paid: 2000, status: "Out", staff: "Sana Malik" },
  { id: "BK-2026-1083", customer: "Maham Ali", phone: "+92 321 7654321", article: "DRB-BRT-012", articleName: "Ivory Gold Walima Gown", delivery: "2026-11-01", returnDate: "2026-11-04", amount: 5200, paid: 5200, status: "Confirmed", staff: "Zoya Ahmed" },
  { id: "BK-2026-1082", customer: "Sana Fatima", phone: "+92 333 9876543", article: "DRB-PRT-029", articleName: "Midnight Blue Pishwas", delivery: "2026-10-30", returnDate: "2026-11-01", amount: 3500, paid: 1500, status: "Out", staff: "Sana Malik" },
  { id: "BK-2026-1081", customer: "Hira Ahmed", phone: "+92 301 4567890", article: "DRB-PRT-023", articleName: "Emerald Embellished Maxi", delivery: "2026-10-28", returnDate: "2026-10-30", amount: 2800, paid: 2800, status: "Returned", staff: "Zoya Ahmed" },
  { id: "BK-2026-1080", customer: "Ayesha Khan", phone: "+92 300 1234567", article: "DRB-BRT-031", articleName: "Crimson Velvet Bridal Set", delivery: "2026-11-05", returnDate: "2026-11-08", amount: 6000, paid: 3000, status: "Confirmed", staff: "Sana Malik" },
];

export const seedPayments = [
  { id: "PAY-2081", booking: "BK-2026-1084", customer: "Ayesha Khan", date: "2026-10-29", amount: 2000, method: "Cash", receivedBy: "Sana Malik" },
  { id: "PAY-2080", booking: "BK-2026-1083", customer: "Maham Ali", date: "2026-10-28", amount: 5200, method: "Bank transfer", receivedBy: "Zoya Ahmed" },
  { id: "PAY-2079", booking: "BK-2026-1080", customer: "Ayesha Khan", date: "2026-10-27", amount: 3000, method: "Cash", receivedBy: "Sana Malik" },
  { id: "PAY-2078", booking: "BK-2026-1082", customer: "Sana Fatima", date: "2026-10-26", amount: 1500, method: "JazzCash", receivedBy: "Zoya Ahmed" },
];
