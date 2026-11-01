import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleDollarSign, Clock3, Download, FileText, LayoutDashboard,
  LogOut, Menu, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Shirt,
  SlidersHorizontal, Sparkles, Users, Wallet, X, UserRound, Truck, LockKeyhole,
  RotateCcw, ChartNoAxesCombined, CreditCard, Eye, Pencil, AlertTriangle, Trash2,
} from "lucide-react";
import { seedArticles, seedBookings, seedCustomers, seedPayments } from "./data.js";
import AccessScreen from "./AccessScreen.jsx";
import PhotoUpload from "./PhotoUpload.jsx";
import { Field } from "./shared.jsx";
import { makePinRecord, verifyPin, validPin } from "./auth.js";
import { itemChanges, loadCollection, mergeChanges, persistCollectionChanges, refreshCollection } from "./dataSync.js";
import { localizeNode } from "./i18n.js";

const currency = (amount) => `PKR ${Number(amount || 0).toLocaleString("en-PK")}`;
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const bookingArticleIds = (booking) => booking.articles?.map((article) => typeof article === "string" ? article : article.id) || (booking.article ? [booking.article] : []);
const bookingArticleNames = (booking) => booking.articles?.map((article) => typeof article === "string" ? article : article.name).filter(Boolean) || (booking.articleName ? [booking.articleName] : []);
const bookingArticleLabels = (booking) => bookingArticleIds(booking).join(", ");
const bookingArticleTitles = (booking) => bookingArticleNames(booking).join(", ");
const dateAfter = (date, days) => {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const stored = (key, fallback) => {
  const value = localStorage.getItem(`drb-${key}`);
  return value ? JSON.parse(value) : fallback;
};
const save = (key, value) => localStorage.setItem(`drb-${key}`, JSON.stringify(value));
const readableDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  : "—";

const navGroups = [
  { label: "WORKSPACE", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "articles", label: "Articles", icon: Shirt, badge: "6" },
    { id: "bookings", label: "Bookings", icon: CalendarDays },
    { id: "customers", label: "Customers", icon: Users },
  ] },
  { label: "OPERATIONS", items: [
    { id: "payments", label: "Payments", icon: Wallet },
    { id: "returns", label: "Returns & tracking", icon: RotateCcw },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
  ] },
  { label: "MANAGEMENT", adminOnly: true, items: [
    { id: "reports", label: "Reports", icon: ChartNoAxesCombined },
    { id: "staff", label: "Staff & roles", icon: ShieldCheck },
    { id: "settings", label: "Settings", icon: Settings },
  ] },
];

function useLocalData(key, fallback) {
  const [value, setValue] = useState(() => stored(key, fallback));
  const update = (next) => {
    setValue(next);
    save(key, next);
  };
  return [value, update];
}

function useSyncedData(collection, fallback) {
  const [value, setValue] = useState(() => stored(collection, fallback));
  const valueRef = useRef(value);
  const revisionRef = useRef(0);

  useEffect(() => {
    let active = true;
    const baselineRevision = revisionRef.current;

    const applyRemote = (remote, original, originalRevision) => {
      if (!active) return;
      const current = valueRef.current;
      const localChanges = revisionRef.current === originalRevision
        ? { upserts: [], deletes: [] }
        : itemChanges(original, current);
      const merged = mergeChanges(remote, localChanges);
      valueRef.current = merged;
      setValue(merged);
      save(collection, merged);
      if (localChanges.upserts.length || localChanges.deletes.length) {
        persistCollectionChanges(collection, remote, merged).catch(() => {});
      }
    };

    const synchronize = () => {
      const original = valueRef.current;
      const originalRevision = revisionRef.current;
      loadCollection(collection, () => valueRef.current)
        .then((remote) => applyRemote(remote, original, originalRevision))
        .catch(() => {});
    };

    const refresh = () => {
      const revision = revisionRef.current;
      refreshCollection(collection, () => valueRef.current)
        .then((remote) => {
          if (!active || revisionRef.current !== revision) return;
          valueRef.current = remote;
          setValue(remote);
          save(collection, remote);
        })
        .catch(() => {});
    };

    synchronize();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [collection]);

  const update = (next) => {
    const previous = valueRef.current;
    const resolved = typeof next === "function" ? next(previous) : next;
    valueRef.current = resolved;
    revisionRef.current += 1;
    setValue(resolved);
    save(collection, resolved);
    persistCollectionChanges(collection, previous, resolved).catch(() => {});
  };

  return [value, update];
}

function Status({ children }) {
  const normalized = String(children).toLowerCase();
  const className = normalized.includes("available") || normalized.includes("returned") || normalized === "paid"
    ? "green"
    : normalized.includes("out") || normalized.includes("due") || normalized.includes("maintenance") || normalized.includes("overdue")
      ? "amber"
      : normalized.includes("cancel") ? "gray" : "rose";
  return <span className={`status status-${className}`}><i />{children}</span>;
}

function Button({ children, variant = "primary", icon: Icon, onClick, type = "button", ...props }) {
  return <button type={type} className={`button button-${variant}`} onClick={onClick} {...props}>
    {Icon && <Icon size={16} strokeWidth={2} />}{children}
  </button>;
}

function PageHeader({ eyebrow, title, description, action, actionLabel, actionIcon: ActionIcon = Plus, onAction }) {
  return <div className="page-heading">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>
    {action && <Button icon={ActionIcon} onClick={onAction}>{actionLabel}</Button>}
  </div>;
}

function Modal({ title, description, onClose, children, wide = false }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{description}</p></div>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}

function Dashboard({ articles, bookings, role, profile, onNavigate }) {
  const due = bookings.reduce((sum, booking) => sum + Math.max(booking.amount - booking.paid, 0), 0);
  const recent = [...bookings].slice(0, 4);
  return <>
    <PageHeader eyebrow={`${role === "admin" ? "ADMINISTRATOR" : "SALESPERSON"} OVERVIEW`} title={`Good morning, ${profile.name.split(" ")[0]} ✨`}
      description="Here’s what’s happening at your boutique today." action actionLabel="Create booking" actionIcon={Plus} onAction={() => onNavigate("new-booking")} />
    <div className="welcome-strip">
      <div className="welcome-icon"><Sparkles size={21} /></div>
      <div><strong>Your boutique at a glance</strong><span>Stay on top of today’s fittings, deliveries and returns.</span></div>
      <button onClick={() => onNavigate("calendar")}>View calendar <ChevronRight size={16} /></button>
      <span className="strip-decoration">✦</span>
    </div>
    <div className="stats-grid">
      <StatCard label="Total articles" value={articles.length} note="Across all categories" icon={Shirt} tone="plum" trend="+2 this month" />
      <StatCard label="Active bookings" value={bookings.filter((booking) => booking.status !== "Returned").length} note="Currently in your diary" icon={CalendarDays} tone="blue" trend="3 upcoming" />
      <StatCard label="Today's deliveries" value={bookings.filter((booking) => booking.delivery === today).length + 2} note="Make sure each is ready" icon={Truck} tone="orange" trend="View checklist" />
      <StatCard label="Outstanding balance" value={currency(due + 6500)} note="Across active bookings" icon={CircleDollarSign} tone="green" trend="View payments" />
    </div>
    <div className="dashboard-grid">
      <section className="panel revenue-panel">
        <div className="panel-heading"><div><h2>Revenue overview</h2><p>Rental income collected this year</p></div>
          <select aria-label="Revenue period" defaultValue="This year"><option>This year</option><option>This month</option><option>This week</option></select></div>
        <div className="revenue-total"><strong>PKR 284,500</strong><span className="trend-positive"><ArrowUpRight size={15} /> 12.8%</span><small>vs. last year</small></div>
        <div className="chart" aria-label="Monthly revenue chart">
          {[42, 56, 48, 69, 61, 77, 55, 87, 67, 94, 74, 100].map((height, index) =>
            <div className="chart-column" key={index}><div className={`chart-bar ${index === 9 ? "chart-bar-active" : ""}`} style={{ height: `${height}%` }} /><span>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][index]}</span></div>)}
        </div>
      </section>
      <section className="panel today-panel">
        <div className="panel-heading"><div><h2>Today’s schedule</h2><p>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p></div>
          <button className="text-button" onClick={() => onNavigate("bookings")}>See all <ChevronRight size={15} /></button></div>
        <div className="timeline">
          <TimelineItem time="10:30 AM" title="Bridal fitting" detail="Ayesha Khan · DRB-BRT-007" tone="plum" />
          <TimelineItem time="12:00 PM" title="Dress delivery" detail="Maham Ali · Ivory Gold Gown" tone="blue" />
          <TimelineItem time="03:30 PM" title="Expected return" detail="Sana Fatima · Midnight Blue" tone="orange" />
        </div>
      </section>
    </div>
    <div className="dashboard-grid lower-grid">
      <section className="panel table-panel">
        <div className="panel-heading"><div><h2>Recent bookings</h2><p>Your latest rental activity</p></div>
          <button className="text-button" onClick={() => onNavigate("bookings")}>View bookings <ChevronRight size={15} /></button></div>
        <div className="table-scroll"><table><thead><tr><th>BOOKING</th><th>CUSTOMER</th><th>ARTICLE</th><th>EVENT DATE</th><th>STATUS</th></tr></thead>
          <tbody>{recent.map((booking) => <tr key={booking.id}><td className="strong-cell">{booking.id}</td><td>{booking.customer}</td><td>{bookingArticleLabels(booking)}</td><td>{readableDate(booking.event)}</td><td><Status>{booking.status}</Status></td></tr>)}</tbody></table></div>
      </section>
      <section className="panel stock-panel">
        <div className="panel-heading"><div><h2>Article availability</h2><p>Inventory at a glance</p></div><button className="text-button" onClick={() => onNavigate("articles")}>Manage <ChevronRight size={15} /></button></div>
        <div className="availability-list">
          <Availability label="Available" count={articles.filter((item) => item.status === "Available").length} total={articles.length} tone="green" />
          <Availability label="Currently rented" count={bookings.filter((item) => item.status === "Out").length} total={articles.length} tone="plum" />
          <Availability label="In maintenance" count={articles.filter((item) => item.status === "Maintenance").length} total={articles.length} tone="orange" />
        </div>
        <div className="stock-note"><AlertTriangle size={15} /><span>1 article needs attention before its next booking.</span></div>
      </section>
    </div>
  </>;
}

function StatCard({ label, value, note, icon: Icon, tone, trend }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon icon-${tone}`}><Icon size={18} /></span></div>
    <strong className="stat-value">{value}</strong><div className="stat-footer"><span>{note}</span><span className="stat-trend">{trend}</span></div></article>;
}

function TimelineItem({ time, title, detail, tone }) {
  return <div className="timeline-item"><span className="timeline-time">{time}</span><span className={`timeline-marker marker-${tone}`} />
    <div className="timeline-card"><strong>{title}</strong><span>{detail}</span></div></div>;
}

function Availability({ label, count, total, tone }) {
  return <div className="availability-row"><div className="availability-label"><span><i className={`dot-${tone}`} />{label}</span><strong>{count} <small>/ {total}</small></strong></div>
    <div className="progress-track"><span className={`progress-${tone}`} style={{ width: `${total ? Math.max((count / total) * 100, 4) : 0}%` }} /></div></div>;
}

function ArticlesPage({ articles, query, onQueryChange, onAdd, onEdit }) {
  const [category, setCategory] = useState("All categories");
  const [availability, setAvailability] = useState("All statuses");
  const filtered = articles.filter((article) => `${article.id} ${article.name} ${article.category}`.toLowerCase().includes(query.toLowerCase())
    && (category === "All categories" || article.category === category)
    && (availability === "All statuses" || article.status === availability));
  return <>
    <PageHeader eyebrow="INVENTORY" title="Article collection" description="Manage your rental pieces, photos, pricing and availability." action actionLabel="Add new article" onAction={onAdd} />
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input placeholder="Search article number or name..." value={query} onChange={(event) => onQueryChange(event.target.value)} /></div>
      <div className="toolbar-controls"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option><option>Bridal Wear</option><option>Party Wear</option><option>Formal Wear</option></select>
        <select aria-label="Filter by availability" value={availability} onChange={(event) => setAvailability(event.target.value)}><option>All statuses</option><option>Available</option><option>Booked</option><option>Maintenance</option></select></div></div>
    <div className="inventory-summary"><span><strong>{filtered.length}</strong> articles found</span><span><i className="dot-green" /> Available <b>{articles.filter((item) => item.status === "Available").length}</b><i className="dot-plum" /> Booked <b>{articles.filter((item) => item.status === "Booked").length}</b></span></div>
    <div className="article-grid">{filtered.map((article) => <ArticleCard key={article.id} article={article} onEdit={onEdit} />)}
      {filtered.length === 0 && <EmptyState title="No articles found" detail="Try changing your search or category filter." />}</div>
  </>;
}

function ArticleCard({ article, onEdit }) {
  return <article className="article-card"><div className={`article-photo photo-${article.color || "rose"}`}>
    {article.photo ? <img src={article.photo} alt={article.name} /> : <div className="photo-placeholder"><Shirt size={34} /><span>Article photo</span></div>}
    <Status>{article.status}</Status><button className="article-menu" aria-label={`Edit ${article.name}`} onClick={() => onEdit(article)}><Pencil size={15} /></button></div>
    <div className="article-info"><div className="article-category">{article.category} <span>·</span> {article.id}</div><h3>{article.name}</h3>
      <div className="article-meta"><span>Suggested rental</span><strong>{currency(article.priceMin ?? article.price)}–{currency(article.priceMax ?? article.price)} <small>/ booking</small></strong></div>
      <div className="article-card-footer"><span>Min. order <strong>{currency(article.minOrder)}</strong></span><button aria-label={`Edit ${article.name}`} onClick={() => onEdit(article)}><Pencil size={15} /></button></div></div></article>;
}

function BookingsPage({ bookings, query, onQueryChange, onNew, onView, isAdmin, onEdit, onDelete }) {
  const [filter, setFilter] = useState("All bookings");
  const [eventDate, setEventDate] = useState("");
  const filtered = bookings.filter((item) => `${item.id} ${item.customer} ${bookingArticleLabels(item)} ${bookingArticleTitles(item)}`.toLowerCase().includes(query.toLowerCase())
    && (filter === "All bookings" || item.status === filter)
    && (!eventDate || (item.event >= eventDate && item.event <= dateAfter(eventDate, 1))));
  return <>
    <PageHeader eyebrow="RENTAL MANAGEMENT" title="Bookings" description="Track reservations, deliveries, event dates and returns." action actionLabel="New booking" onAction={onNew} />
    <div className="booking-stats"><MiniMetric label="All bookings" value={bookings.length} /><MiniMetric label="Confirmed" value={bookings.filter((b) => b.status === "Confirmed").length} tone="plum" /><MiniMetric label="Currently out" value={bookings.filter((b) => b.status === "Out").length} tone="orange" /><MiniMetric label="Returned" value={bookings.filter((b) => b.status === "Returned").length} tone="green" /></div>
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input placeholder="Search booking, customer or article..." value={query} onChange={(event) => onQueryChange(event.target.value)} /></div>
      <div className="toolbar-controls"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All bookings</option><option>Confirmed</option><option>Out</option><option>Returned</option></select>
        <Button variant="outline" icon={Download} onClick={() => window.print()}>Export</Button></div></div>
    <section className="booking-date-filter-panel"><div><strong>Filter bookings by event date</strong><span>Select a date to show its bookings and the following day.</span></div><label><CalendarDays size={16} /><input aria-label="Filter bookings from selected event date through next day" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>{eventDate && <><span className="booking-date-range">Showing {readableDate(eventDate)} – {readableDate(dateAfter(eventDate, 1))}</span><Button variant="outline" onClick={() => setEventDate("")}>Clear date</Button></>}</section>
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>BOOKING ID</th><th>CUSTOMER</th><th>ARTICLES</th><th>DELIVERY</th><th>EVENT</th><th>RETURN</th><th>AMOUNT / DUE</th><th>STATUS</th><th></th></tr></thead>
      <tbody>{filtered.map((booking) => <tr key={booking.id} onClick={() => onView(booking)} className="clickable-row">
        <td className="strong-cell">{booking.id}</td><td><strong>{booking.customer}</strong><small className="sub-cell">{booking.phone}</small></td>
        <td><span className="article-id">{bookingArticleLabels(booking)}</span><small className="sub-cell">{bookingArticleTitles(booking)}</small></td><td>{readableDate(booking.delivery)}</td><td>{readableDate(booking.event)}</td><td>{readableDate(booking.returnDate)}</td>
        <td><strong>{currency(booking.amount)}</strong><small className="sub-cell">{booking.amount > booking.paid ? `${currency(booking.amount - booking.paid)} due` : "Paid"}</small></td>
        <td><Status>{booking.status}</Status></td><td><div className="booking-row-actions"><button className="icon-button" onClick={(event) => { event.stopPropagation(); onView(booking); }} aria-label="View booking"><Eye size={16} /></button>{isAdmin && <><button className="icon-button" onClick={(event) => { event.stopPropagation(); onEdit(booking); }} aria-label={`Edit booking ${booking.id}`}><Pencil size={15} /></button><button className="icon-button booking-delete-button" onClick={(event) => { event.stopPropagation(); onDelete(booking); }} aria-label={`Delete booking ${booking.id}`}><Trash2 size={15} /></button></>}</div></td></tr>)}</tbody></table>
      {filtered.length === 0 && <EmptyState title="No bookings found" detail="Try another search or add your first booking." />}</div></section>
  </>;
}

function MiniMetric({ label, value, tone = "gray" }) {
  return <div className="mini-metric"><span className={`mini-dot mini-${tone}`} /><div><strong>{value}</strong><span>{label}</span></div></div>;
}

function CustomersPage({ customers, query, onQueryChange, onAdd }) {
  const filtered = customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.phone2 || ""} ${customer.address} ${customer.city || ""} ${customer.id}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeader eyebrow="CUSTOMER RELATIONSHIPS" title="Customers" description="Know your regulars and keep every customer detail in one place." action actionLabel="Add customer" onAction={onAdd} />
    <div className="customer-stat-row"><div><Users size={19} /><strong>{customers.length}</strong><span>Total customers</span></div><div><Sparkles size={19} /><strong>{customers.filter((c) => c.bookings > 1).length}</strong><span>Returning customers</span></div><div><Wallet size={19} /><strong>{currency(customers.reduce((sum, c) => sum + c.due, 0))}</strong><span>Outstanding balance</span></div></div>
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search by customer name or phone..." /></div>
      <Button variant="outline" icon={Download} onClick={() => window.print()}>Export</Button></div>
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>ADDRESS</th><th>BOOKINGS</th><th>OUTSTANDING</th><th></th></tr></thead>
      <tbody>{filtered.map((customer, i) => <tr key={customer.id}><td><div className="customer-cell"><span className={`avatar avatar-${i % 4}`}>{customer.name.split(" ").map((part) => part[0]).join("")}</span><div><strong>{customer.name}</strong><small>{customer.id}</small></div></div></td>
        <td>{customer.phone}{customer.phone2 && <small className="sub-cell">{customer.phone2}</small>}</td><td>{[customer.address, customer.city].filter(Boolean).join(", ")}</td><td><span className="booking-count">{customer.bookings} rentals</span></td>
        <td className={customer.due ? "due-text" : "paid-text"}>{customer.due ? currency(customer.due) : "Clear"}</td><td><button className="icon-button" title="View customer"><Eye size={16} /></button></td></tr>)}</tbody></table>
      {filtered.length === 0 && <EmptyState title="No customers found" detail="Try searching by their name or number." />}</div></section>
  </>;
}

function PaymentsPage({ payments, bookings, query, onQueryChange, onAdd }) {
  const due = bookings.reduce((sum, item) => sum + Math.max(item.amount - item.paid, 0), 0);
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const filtered = payments.filter((item) => `${item.id} ${item.booking} ${item.customer}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeader eyebrow="FINANCE" title="Payments" description="Record instalments and keep a clear view of every balance." action actionLabel="Record payment" onAction={onAdd} />
    <div className="finance-cards"><FinanceCard label="Collected this month" value={currency(total + 18400)} note="Across all payment methods" icon={ArrowDownLeft} tone="green" /><FinanceCard label="Outstanding balance" value={currency(due + 6500)} note="Across active bookings" icon={Clock3} tone="orange" /><FinanceCard label="Transactions" value={payments.length + 36} note="This month" icon={CreditCard} tone="plum" /></div>
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search by receipt, booking or customer..." /></div><Button variant="outline" icon={Download} onClick={() => window.print()}>Export statement</Button></div>
    <section className="panel table-panel"><div className="panel-heading table-title"><div><h2>Payment history</h2><p>Recent transactions and receipts</p></div><span className="subtle-count">{filtered.length} transactions</span></div>
      <div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>BOOKING</th><th>CUSTOMER</th><th>DATE</th><th>METHOD</th><th>RECEIVED BY</th><th>AMOUNT</th></tr></thead><tbody>
        {filtered.map((payment) => <tr key={payment.id}><td className="strong-cell">{payment.id}</td><td>{payment.booking}</td><td>{payment.customer}</td><td>{readableDate(payment.date)}</td><td><span className="payment-method"><CircleDollarSign size={15} />{payment.method}</span></td><td>{payment.receivedBy}</td><td className="money-cell">{currency(payment.amount)}</td></tr>)}
      </tbody></table>{filtered.length === 0 && <EmptyState title="No payments found" detail="Recorded payments will appear here." />}</div></section>
    <section className="panel due-panel"><div className="due-panel-icon"><AlertTriangle size={18} /></div><div><strong>Balances to follow up</strong><span>There are {bookings.filter((b) => b.amount > b.paid && b.status !== "Returned").length} active bookings with remaining payments.</span></div><strong>{currency(due + 6500)}</strong></section>
  </>;
}

function FinanceCard({ label, value, note, icon: Icon, tone }) {
  return <article className="finance-card"><span className={`stat-icon icon-${tone}`}><Icon size={18} /></span><span className="finance-label">{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function ReturnsPage({ bookings, onReturn }) {
  const active = bookings.filter((booking) => booking.status === "Out" || booking.status === "Confirmed");
  const out = active.filter((booking) => booking.status === "Out");
  return <>
    <PageHeader eyebrow="RENTAL OPERATIONS" title="Returns & tracking" description="Keep every rental on schedule, from delivery to return." />
    <div className="return-alert"><div className="alert-icon"><Clock3 size={20} /></div><div><strong>{out.length} items currently with customers</strong><span>Check expected return dates and prepare upcoming reservations.</span></div><button onClick={() => document.getElementById("returns-list")?.scrollIntoView({ behavior: "smooth" })}>View items <ChevronRight size={16} /></button></div>
    <div className="booking-stats"><MiniMetric label="Currently rented" value={out.length} tone="orange" /><MiniMetric label="Due today" value={out.filter((b) => b.returnDate === today).length + 1} tone="plum" /><MiniMetric label="Upcoming deliveries" value={active.filter((b) => b.delivery >= today).length} tone="green" /><MiniMetric label="Overdue" value="0" /></div>
    <section className="panel table-panel" id="returns-list"><div className="panel-heading table-title"><div><h2>Rental tracking</h2><p>Confirm returns as soon as the article is received and checked.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>BOOKING</th><th>ARTICLE</th><th>CUSTOMER</th><th>DELIVERY DATE</th><th>EXPECTED RETURN</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {active.map((booking) => <tr key={booking.id}><td className="strong-cell">{booking.id}</td><td><strong>{bookingArticleTitles(booking)}</strong><small className="sub-cell">{bookingArticleLabels(booking)}</small></td><td>{booking.customer}<small className="sub-cell">{booking.phone}</small></td><td>{readableDate(booking.delivery)}</td><td>{readableDate(booking.returnDate)}</td><td><Status>{booking.status === "Out" ? booking.returnDate < today ? "Overdue" : "With customer" : "Upcoming"}</Status></td>
          <td>{booking.status === "Out" ? <Button variant="small" icon={Check} onClick={() => onReturn(booking.id)}>Confirm return</Button> : <span className="subtle-count">Not delivered</span>}</td></tr>)}
      </tbody></table></div></section>
    <div className="return-tip"><Sparkles size={17} /><span><strong>Return checklist:</strong> inspect the article condition, record any damage, and confirm any remaining payment before marking it available.</span></div>
  </>;
}

function CalendarPage({ bookings, onNew }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dateString = (day) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayEvents = (day) => bookings.filter((booking) => booking.delivery === dateString(day) || booking.event === dateString(day) || booking.returnDate === dateString(day));
  return <>
    <PageHeader eyebrow="PLANNING" title="Calendar" description="See deliveries, event dates and expected returns in one place." action actionLabel="Add booking" onAction={onNew} />
    <div className="calendar-layout"><section className="panel calendar-panel"><div className="calendar-toolbar"><div><h2>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><span>Rental schedule</span></div>
      <div className="calendar-arrows"><button className="button button-outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} />Previous</button><button className="button button-outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next<ChevronRight size={17} /></button></div></div>
      <div className="calendar-grid">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
        {Array.from({ length: offset }, (_, i) => <div className="calendar-day empty-day" key={`empty-${i}`} />)}
        {Array.from({ length: days }, (_, i) => { const day = i + 1; const events = dayEvents(day); return <div className={`calendar-day ${dateString(day) === today ? "current-day" : ""}`} key={day}><span className="day-number">{day}</span>
          {events.slice(0, 2).map((event) => <span className={`calendar-event event-${event.delivery === dateString(day) ? "delivery" : event.returnDate === dateString(day) ? "return" : "event"}`} key={`${event.id}-${day}`}>{event.delivery === dateString(day) ? "Out" : event.returnDate === dateString(day) ? "Return" : "Event"} · {event.customer.split(" ")[0]}</span>)}
          {events.length > 2 && <small className="more-events">+{events.length - 2} more</small>}</div>; })}
      </div></section>
      <aside className="panel calendar-side"><div className="panel-heading"><div><h2>Upcoming</h2><p>Next in your schedule</p></div></div>
        <div className="calendar-legend"><span><i className="legend-delivery" />Delivery</span><span><i className="legend-event" />Event date</span><span><i className="legend-return" />Expected return</span></div>
        {bookings.filter((b) => b.status !== "Returned").slice(0, 4).map((booking) => <div className="upcoming-item" key={booking.id}><div className="upcoming-date"><strong>{new Date(`${booking.delivery}T00:00:00`).getDate()}</strong><span>{new Date(`${booking.delivery}T00:00:00`).toLocaleDateString("en", { month: "short" })}</span></div><div><strong>{booking.customer}</strong><span>{bookingArticleTitles(booking)}</span><small>Delivery · {readableDate(booking.delivery)}</small></div></div>)}
      </aside></div>
  </>;
}

function ReportsPage({ bookings, payments, articles }) {
  return <>
    <PageHeader eyebrow="BUSINESS INSIGHTS" title="Reports" description="Understand your rental performance and make informed decisions." action actionLabel="Download report" actionIcon={Download} onAction={() => window.print()} />
    <div className="report-period"><span>Showing performance for</span><select defaultValue="This month"><option>This month</option><option>This week</option><option>This year</option><option>Custom range</option></select><button className="button button-outline" onClick={() => window.print()}><Download size={15} /> Export PDF</button></div>
    <div className="stats-grid report-stats"><StatCard label="Rental revenue" value={currency(payments.reduce((sum, p) => sum + p.amount, 0) + 18400)} note="Collected payments" icon={Wallet} tone="green" trend="+12.8%" /><StatCard label="Bookings created" value={bookings.length + 32} note="Compared to last month" icon={CalendarDays} tone="plum" trend="+8 bookings" /><StatCard label="Average rental" value={currency(3850)} note="Per confirmed booking" icon={CircleDollarSign} tone="blue" trend="Steady" /><StatCard label="Top category" value="Bridal wear" note={`${articles.filter((a) => a.category === "Bridal Wear").length + 18} rentals this month`} icon={Shirt} tone="orange" trend="Most popular" /></div>
    <div className="dashboard-grid"><section className="panel report-panel"><div className="panel-heading"><div><h2>Bookings by month</h2><p>Confirmed rentals over the past 6 months</p></div></div>
      <div className="report-chart">{[48, 62, 54, 80, 68, 96].map((height, i) => <div className="report-bar-column" key={i}><strong>{[18,24,21,32,28,39][i]}</strong><div className="report-bar" style={{ height: `${height}%` }} /><span>{["May","Jun","Jul","Aug","Sep","Oct"][i]}</span></div>)}</div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Popular categories</h2><p>Share of all rentals</p></div></div><div className="category-report">
        {[["Bridal wear", 58, "plum"], ["Party wear", 28, "orange"], ["Formal wear", 14, "blue"]].map(([label, percent, color]) => <div className="category-row" key={label}><div><span>{label}</span><strong>{percent}%</strong></div><div className="progress-track"><span className={`progress-${color}`} style={{ width: `${percent}%` }} /></div></div>)}
      </div></section></div>
    <div className="report-shortcuts"><ReportShortcut icon={FileText} title="Booking report" detail="All rentals by date and status" /><ReportShortcut icon={Wallet} title="Pending payments" detail="Balances that need follow-up" /><ReportShortcut icon={RotateCcw} title="Return history" detail="Returned and overdue articles" /><ReportShortcut icon={Users} title="Staff performance" detail="Bookings by team member" /></div>
  </>;
}

function ReportShortcut({ icon: Icon, title, detail }) {
  return <button className="report-shortcut" onClick={() => window.print()}><span><Icon size={18} /></span><strong>{title}</strong><small>{detail}</small><ChevronRight size={16} /></button>;
}

function StaffPage({ salespeople, onAdd, onEdit, onToggle, onDelete, onChangeAdminPin }) {
  const activeCount = salespeople.filter((person) => person.active !== false).length;
  return <>
    <PageHeader eyebrow="TEAM ACCESS" title="Staff & roles" description="Create up to six salesperson profiles and assign each person their own PIN." action actionLabel="Add salesperson" onAction={onAdd} />
    <div className="role-banner"><ShieldCheck size={21} /><div><strong>Administrator PIN protection</strong><span>Only an administrator can create or manage salesperson profiles.</span></div><button className="button button-outline" onClick={onChangeAdminPin}>Change admin PIN</button></div>
    <div className="staff-capacity"><div><Users size={18} /><strong>{activeCount} of 6</strong><span>active salesperson profiles</span></div><div className="staff-slots">{Array.from({ length: 6 }, (_, index) => <span className={index < activeCount ? "staff-slot-filled" : ""} key={index} />)}</div></div>
    <section className="panel table-panel"><div className="panel-heading table-title"><div><h2>Salesperson profiles</h2><p>PINs are hashed and saved in this browser demo.</p></div></div>
      {salespeople.length ? <div className="table-scroll"><table><thead><tr><th>TEAM MEMBER</th><th>PHONE</th><th>ROLE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{salespeople.map((person, index) => <tr key={person.id}>
        <td><div className="customer-cell"><span className={`avatar avatar-${index % 4}`}>{person.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><strong>{person.name}</strong><small>{person.email || "Salesperson account"}</small></div></div></td>
        <td>{person.phone || "—"}</td><td><span className="role-pill role-sales"><UserRound size={13} />Salesperson</span></td><td><Status>{person.active === false ? "Inactive" : "Active"}</Status></td>
        <td><div className="staff-actions"><button className="button button-outline staff-action" onClick={() => onEdit(person)}><Pencil size={13} />Edit / PIN</button><button className="button button-outline staff-action" onClick={() => onToggle(person.id)}>{person.active === false ? "Activate" : "Deactivate"}</button><button className="icon-button staff-delete" aria-label={`Remove ${person.name}`} title="Remove profile" onClick={() => onDelete(person)}><X size={15} /></button></div></td>
      </tr>)}</tbody></table></div> : <EmptyState title="No salesperson profiles yet" detail="Add your first profile. Salespeople will sign in with their own PIN." />}
    </section>
    <div className="permission-cards"><div className="permission-card"><ShieldCheck size={20} /><strong>Administrator</strong><span>Full access to articles, bookings, payments, reports, staff profiles, and settings.</span><small>1 protected admin profile</small></div><div className="permission-card"><UserRound size={20} /><strong>Salesperson</strong><span>Access to articles, customers, bookings, payment recording, and return updates.</span><small>Up to 6 profiles · individual PINs</small></div></div>
  </>;
}

function StaffForm({ person, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(person?.name || "");
  const [phone, setPhone] = useState(person?.phone || "");
  const [email, setEmail] = useState(person?.email || "");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) { setError("Enter the salesperson’s name."); return; }
    if (!person && !validPin(pin)) { setError("Create a 4 to 6 digit PIN for this profile."); return; }
    if (pin && !validPin(pin)) { setError("PIN must contain 4 to 6 digits."); return; }
    if (pin && pin !== confirmPin) { setError("The PIN entries do not match."); return; }
    if (!person && !pin) { setError("Create a PIN for this profile."); return; }
    setSaving(true);
    try {
      await onSave({ id: person?.id, name: name.trim(), phone: phone.trim(), email: email.trim(), pin: pin || null });
    } catch {
      setError("Could not save this profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return <form className="form-grid" onSubmit={submit}>
    <Field label="Full name *" className="field-full"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Salesperson name" required /></Field>
    <Field label="Phone number"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+92 300 0000000" /></Field>
    <Field label="Email address"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Optional" /></Field>
    <Field label={person ? "New PIN (optional)" : "Create PIN *"}><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={person ? "Leave blank to keep current" : "4–6 digits"} autoComplete="new-password" required={!person} /></Field>
    {(!person || pin) && <Field label="Confirm PIN *"><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Re-enter PIN" autoComplete="new-password" required={!person || Boolean(pin)} /></Field>}
    {error && <p className="form-error field-full" role="alert">{error}</p>}
    <div className="modal-actions">{person && <button className="button button-danger" type="button" onClick={() => onDelete(person)}>Remove profile</button>}<Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={Check} disabled={saving}>{saving ? "Saving…" : person ? "Save profile" : "Create profile"}</Button></div>
  </form>;
}

function AdminPinForm({ onSave, onCancel }) {
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!validPin(pin)) { setError("New PIN must contain 4 to 6 digits."); return; }
    if (pin !== confirmPin) { setError("The new PIN entries do not match."); return; }
    setBusy(true);
    try {
      const success = await onSave(currentPin, pin);
      if (!success) setError("Current administrator PIN is incorrect.");
    } catch {
      setError("Could not save your administrator PIN. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return <form className="form-grid" onSubmit={submit}>
    <Field label="Current administrator PIN *" className="field-full"><input type="password" inputMode="numeric" maxLength={6} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></Field>
    <Field label="New PIN *"><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></Field>
    <Field label="Confirm new PIN *"><input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></Field>
    {error && <p className="form-error field-full" role="alert">{error}</p>}
    <div className="modal-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={ShieldCheck} disabled={busy}>{busy ? "Saving…" : "Update admin PIN"}</Button></div>
  </form>;
}

function SettingsPage({ language, onLanguageChange, fontSize, onFontSizeChange }) {
  const [saved, setSaved] = useState(false);
  return <>
    <PageHeader eyebrow="PREFERENCES" title="Boutique settings" description="Configure business details and defaults for your workspace." />
    <div className="settings-layout"><nav className="settings-nav"><button className="settings-active"><Settings size={16} />Business profile</button><button><ShieldCheck size={16} />Security & access</button><button><Bell size={16} />Notifications</button><button><FileText size={16} />Receipt details</button></nav>
      <section className="panel settings-panel"><div className="panel-heading"><div><h2>Business profile</h2><p>These details appear on booking receipts.</p></div></div>
        <div className="settings-language">
          <Field label="Language"><select value={language} onChange={(event) => onLanguageChange(event.target.value)}><option value="en">English</option><option value="ur">Urdu</option></select></Field>
          <Field label="Font size">
            <div className="font-size-control">
              <input aria-label="Font size" type="range" min="14" max="24" step="1" value={fontSize} onChange={(event) => onFontSizeChange(event.target.value)} />
              <output>{fontSize}px</output>
            </div>
          </Field>
          <p>English is the default language. Choose Urdu to switch the interface. Font size is saved in this browser.</p>
        </div>
        <div className="settings-fields"><Field label="Boutique name"><input defaultValue="Dulhan Rani Boutique" /></Field><Field label="Contact phone"><input defaultValue="+92 300 0000000" /></Field><Field label="Email address"><input defaultValue="hello@dulhanrani.pk" /></Field><Field label="Currency"><select defaultValue="PKR — Pakistani Rupee"><option>PKR — Pakistani Rupee</option></select></Field><Field label="Boutique address" className="field-full"><textarea rows="3" defaultValue="Zargran,Sheikhupura, Pakistan" /></Field></div>
        <div className="settings-save"><span>{saved ? "Changes saved in this demo." : "Changes are stored in this browser demo."}</span><Button onClick={() => setSaved(true)} icon={Check}>Save changes</Button></div></section></div>
  </>;
}

function ProfilePage({ profile, role, onEdit }) {
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <>
    <PageHeader eyebrow="YOUR ACCOUNT" title="My profile" description="Review and update your account information." />
    <section className="profile-hero panel"><div className="profile-avatar">{initials}</div><div className="profile-person"><h2>{profile.name}</h2><span>{profile.email}</span><span className={`role-pill role-${role === "admin" ? "admin" : "sales"}`}>{role === "admin" ? <ShieldCheck size={13} /> : <UserRound size={13} />}{role === "admin" ? "Administrator" : "Salesperson"}</span></div><button className="button button-outline" onClick={onEdit}><Pencil size={15} />Edit profile</button></section>
    <div className="profile-grid"><section className="panel profile-section"><div className="panel-heading"><div><h2>Account details</h2><p>Your personal and contact information</p></div><button className="text-button" onClick={onEdit}><Pencil size={13} /> Edit</button></div><div className="profile-detail"><span>Full name</span><strong>{profile.name}</strong></div><div className="profile-detail"><span>Email address</span><strong>{profile.email}</strong></div><div className="profile-detail"><span>Phone number</span><strong>{profile.phone}</strong></div><div className="profile-detail"><span>Role</span><strong>{role === "admin" ? "Administrator" : "Salesperson"}</strong></div><div className="profile-detail"><span>Member since</span><strong>October 2024</strong></div></section>
      <section className="panel profile-section"><div className="panel-heading"><div><h2>Profile security</h2><p>Each team member signs in with an individual PIN.</p></div></div><div className="security-profile-info"><span className="role-option-icon admin-icon"><LockKeyhole size={18} /></span><div><strong>PIN-protected profile</strong><small>{role === "admin" ? "You can update the administrator PIN under Staff & roles." : "Ask your administrator to reset your salesperson PIN."}</small></div></div><p className="demo-notice">PINs are browser-demo access controls. Add a backend before using this for real security.</p></section></div>
  </>;
}

function ProfileEditForm({ profile, onSave, onCancel }) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const updated = { name: name.trim(), email: email.trim(), phone: phone.trim() };
    if (!updated.name || !updated.email || !updated.phone) {
      setError("Please complete all profile fields.");
      return;
    }
    onSave(updated);
  };

  return <form className="form-grid" onSubmit={submit}>
    <Field label="Full name *" className="field-full"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></Field>
    <Field label="Email address *" className="field-full"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
    <Field label="Phone number *" className="field-full"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></Field>
    {error && <p className="form-error field-full" role="alert">{error}</p>}
    <div className="modal-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={Check}>Save profile</Button></div>
  </form>;
}

function ProfileMenu({ role, profile, onProfile, onSignOut }) {
  const [open, setOpen] = useState(false);
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className="profile-menu-wrap"><button className="profile-menu-button" onClick={() => setOpen(!open)}><span className="avatar avatar-plum">{initials}</span><span className="profile-menu-copy"><strong>{profile.name}</strong><small>{role === "admin" ? "Administrator" : "Salesperson"}</small></span><ChevronDown size={15} /></button>
    {open && <div className="profile-dropdown"><button onClick={() => { onProfile(); setOpen(false); }}><UserRound size={15} />My profile</button><button onClick={() => { onSignOut(); setOpen(false); }}><LogOut size={15} />Sign out</button></div>}</div>;
}

function EmptyState({ title, detail }) {
  return <div className="empty-state"><span><Search size={19} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

export default function App() {
  const [syncStatus, setSyncStatus] = useState("syncing");
  const [syncError, setSyncError] = useState("");
  useEffect(() => {
    const handleSyncStatus = (event) => {
      setSyncStatus(event.detail.status);
      setSyncError(event.detail.error || "");
    };
    window.addEventListener("drb-sync-status", handleSyncStatus);
    return () => window.removeEventListener("drb-sync-status", handleSyncStatus);
  }, []);
  const [articles, setArticles] = useSyncedData("articles", seedArticles);
  const [customers, setCustomers] = useSyncedData("customers", seedCustomers);
  const [bookings, setBookings] = useSyncedData("bookings", seedBookings);
  const [payments, setPayments] = useSyncedData("payments", seedPayments);
  const [profile, setProfile] = useLocalData("profile", {
    name: "Sana Malik",
    email: "sana@dulhanrani.pk",
    phone: "+92 300 0000000",
  });
  const [adminPin, setAdminPin] = useLocalData("admin-pin", null);
  const [salespeople, setSalespeople] = useLocalData("salespeople", []);
  const [activePage, setActivePage] = useState("dashboard");
  const [session, setSession] = useState(null);
  const [bootStage, setBootStage] = useState("splash");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [quickCreatedArticleId, setQuickCreatedArticleId] = useState("");
  const [toast, setToast] = useState("");
  const [language, setLanguage] = useLocalData("language", "en");
  const [savedFontSize, setFontSize] = useLocalData("font-size", "18");
  const fontSize = ({ normal: "14", large: "18", "extra-large": "24" })[savedFontSize] || savedFontSize;
  const toastTimer = useRef(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setBootStage("access"), 1900);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const content = document.getElementById("root");
    const isUrdu = language === "ur";
    root.lang = isUrdu ? "ur" : "en";
    root.dir = isUrdu ? "rtl" : "ltr";
    root.dataset.fontSize = fontSize;
    root.style.setProperty("--mobile-reading-size", `${fontSize}px`);
    root.style.setProperty("--mobile-heading-size", `${Math.round(Number(fontSize) * 1.7)}px`);
    if (!content) return undefined;
    localizeNode(content, language);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "characterData") localizeNode(record.target, language);
        else if (record.type === "attributes") localizeNode(record.target, language);
        else record.addedNodes.forEach((node) => localizeNode(node, language));
      });
    });
    observer.observe(content, { attributes: true, attributeFilter: ["placeholder", "aria-label", "title"], characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [fontSize, language]);
  const notify = (message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 5000);
  };
  const role = session?.role || "admin";
  const activeSalesperson = session?.role === "sales" ? salespeople.find((person) => person.id === session.id) : null;
  const currentProfile = session?.role === "sales" ? activeSalesperson || profile : profile;
  const pageTitles = {
    dashboard: "Dashboard", articles: "Articles", bookings: "Bookings", customers: "Customers",
    payments: "Payments", returns: "Returns & tracking", calendar: "Calendar", reports: "Reports",
    staff: "Staff & roles", settings: "Settings", profile: "My profile",
  };
  const visibleGroups = navGroups.filter((group) => !group.adminOnly || role === "admin");
  const nav = (page) => {
    if (page === "new-booking") setModal({ type: "booking" });
    else { setActivePage(page); setQuery(""); }
    setMobileNav(false);
  };
  const handleAdminSetup = async ({ name, pin }) => {
    const pinRecord = await makePinRecord(pin);
    setProfile({ ...profile, name });
    setAdminPin(pinRecord);
    setSession({ role: "admin" });
    setActivePage("dashboard");
  };
  const handleSignIn = async (selected, pin) => {
    if (!await verifyPin(pin, selected.pinRecord)) return false;
    if (selected.role === "admin") setSession({ role: "admin" });
    else setSession({ role: "sales", id: selected.id });
    setActivePage("dashboard");
    setQuery("");
    return true;
  };
  const signOut = () => {
    setSession(null);
    setActivePage("dashboard");
    setQuery("");
    setModal(null);
  };
  const handleProfileSave = (updatedProfile) => {
    if (role === "admin") setProfile(updatedProfile);
    else setSalespeople(salespeople.map((person) => person.id === session.id ? { ...person, ...updatedProfile } : person));
    setModal(null);
    notify("Profile updated successfully.");
  };
  const handleStaffSave = async (details) => {
    if (!details.id && salespeople.length >= 6) {
      notify("You can create a maximum of six salesperson profiles.");
      return;
    }
    let updated = { ...details };
    if (details.pin) updated.pin = await makePinRecord(details.pin);
    else if (details.id) updated.pin = salespeople.find((person) => person.id === details.id)?.pin;
    updated = { ...updated, active: details.id ? salespeople.find((person) => person.id === details.id)?.active !== false : true };
    if (details.id) setSalespeople(salespeople.map((person) => person.id === details.id ? { ...person, ...updated } : person));
    else {
      updated.id = `sales-${crypto.randomUUID()}`;
      setSalespeople([...salespeople, updated]);
    }
    setModal(null);
    notify(details.id ? "Salesperson profile updated." : "Salesperson profile created.");
  };
  const handleStaffDelete = (person) => {
    if (!window.confirm(`Remove ${person.name}'s profile? They will no longer be able to sign in.`)) return;
    setSalespeople(salespeople.filter((item) => item.id !== person.id));
    if (session?.id === person.id) signOut();
    setModal(null);
    notify("Salesperson profile removed.");
  };
  const handleStaffToggle = (personId) => {
    setSalespeople(salespeople.map((person) => person.id === personId ? { ...person, active: person.active === false } : person));
    notify("Salesperson profile status updated.");
  };
  const handleAdminPinUpdate = async (currentPin, newPin) => {
    if (!await verifyPin(currentPin, adminPin)) return false;
    setAdminPin(await makePinRecord(newPin));
    setModal(null);
    notify("Administrator PIN updated.");
    return true;
  };
  const handleArticleSubmit = (event, editingArticleId = null, closeModal = true) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const priceMin = Number(form.get("priceMin"));
    const priceMax = Number(form.get("priceMax"));
    if (priceMax < priceMin) { notify("Maximum suggested rental must be at least the minimum."); return; }
    const next = { id: editingArticleId || form.get("id").trim(), name: form.get("name").trim(), category: form.get("category"), price: Math.round((priceMin + priceMax) / 2), priceMin, priceMax, minOrder: Number(form.get("minOrder")), status: form.get("status"), photo: form.get("photoData") || "", color: form.get("color") || "rose" };
    if (!editingArticleId && articles.some((item) => item.id.toLowerCase() === next.id.toLowerCase())) { notify("That article number is already in use."); return; }
    setArticles(editingArticleId
      ? articles.map((item) => item.id === editingArticleId ? next : item)
      : [next, ...articles]);
    if (editingArticleId) setBookings(bookings.map((booking) => {
      if (!bookingArticleIds(booking).includes(editingArticleId)) return booking;
      const updatedArticles = booking.articles?.map((item) => typeof item === "string"
        ? item === editingArticleId ? { ...next } : item
        : item.id === editingArticleId ? { ...item, name: next.name, photo: next.photo } : item);
      return { ...booking, ...(updatedArticles ? { articles: updatedArticles } : {}), articleName: bookingArticleIds(booking).map((id) => id === editingArticleId ? next.name : articles.find((item) => item.id === id)?.name || id).join(", ") };
    }));
    if (closeModal) setModal(null);
    notify(editingArticleId ? "Article changes saved." : "Article added to your collection.");
    return next;
  };
  const handleBookingSubmit = (event, editingBookingId = null) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedIds = form.getAll("articles").map(String);
    const selectedArticles = articles.filter((item) => selectedIds.includes(item.id));
    const customer = customers.find((item) => item.id === form.get("customer"));
    const existing = editingBookingId ? bookings.find((item) => item.id === editingBookingId) : null;
    if (editingBookingId && role !== "admin") { notify("Only an administrator can edit bookings."); return; }
    if (!selectedArticles.length || selectedArticles.length !== selectedIds.length || !customer || (editingBookingId && !existing)) { notify("Choose a customer and at least one valid article."); return; }
    const delivery = form.get("delivery"), returnDate = form.get("returnDate");
    const eventDate = form.get("event");
    if (returnDate < delivery || eventDate < delivery || eventDate > returnDate) {
      notify("Check the booking dates: event and return dates must follow delivery.");
      return;
    }
    const shouldCheckAvailability = !existing || !["Returned", "Cancelled"].includes(existing.status);
    const clash = shouldCheckAvailability && selectedArticles.flatMap((article) => {
      const conflictingBooking = bookings.find((booking) => booking.id !== editingBookingId && bookingArticleIds(booking).includes(article.id) && !["Returned", "Cancelled"].includes(booking.status)
        && delivery <= booking.returnDate && returnDate >= booking.delivery);
      return conflictingBooking ? [{ article, booking: conflictingBooking }] : [];
    })[0];
    if (clash) { notify(`Date conflict: ${clash.article.id} is reserved for ${clash.booking.customer} until ${readableDate(clash.booking.returnDate)}.`); return; }
    const amount = Number(form.get("amount")), paid = Number(form.get("paid"));
    if (amount < paid) { notify("Rental amount cannot be less than the advance already paid."); return; }
    if (existing && paid !== existing.paid) { notify("Payments must be changed from the Payments page."); return; }
    const normalizedArticles = selectedArticles.map(({ id, name, photo, price }) => ({ id, name, photo, price }));
    const nextBooking = { ...existing, id: existing?.id || `BK-2026-${1085 + bookings.length}`, customerId: customer.id, customer: customer.name, phone: customer.phone, phone2: customer.phone2 || "", articles: normalizedArticles, article: normalizedArticles.map((item) => item.id).join(", "), articleName: normalizedArticles.map((item) => item.name).join(", "), delivery, event: eventDate, returnDate, amount, paid, chest: form.get("chest") || "", back: form.get("back") || "", hip: form.get("hip") || "", status: existing?.status || "Confirmed", staff: existing?.staff || currentProfile.name, notes: form.get("notes") };
    if (existing) {
      const updatedBookings = bookings.map((item) => item.id === existing.id ? nextBooking : item);
      setBookings(updatedBookings);
      setPayments(payments.map((payment) => payment.booking === existing.id ? { ...payment, customer: customer.name } : payment));
      if (!["Returned", "Cancelled"].includes(existing.status)) {
        const affectedIds = new Set([...bookingArticleIds(existing), ...selectedIds]);
        setArticles(articles.map((item) => {
          if (!affectedIds.has(item.id) || item.status === "Maintenance") return item;
          const isBooked = updatedBookings.some((booking) => bookingArticleIds(booking).includes(item.id) && !["Returned", "Cancelled"].includes(booking.status));
          return { ...item, status: isBooked ? "Booked" : "Available" };
        }));
      }
      setModal(null);
      notify(`Booking ${existing.id} updated successfully.`);
      return;
    }
    setBookings([nextBooking, ...bookings]);
    setArticles(articles.map((item) => selectedIds.includes(item.id) && item.status !== "Maintenance" ? { ...item, status: "Booked" } : item));
    if (paid > 0) setPayments([{ id: `PAY-${2082 + payments.length}`, booking: nextBooking.id, customer: nextBooking.customer, date: today, amount: paid, method: form.get("method"), receivedBy: currentProfile.name }, ...payments]);
    setModal(null); notify(`Booking ${nextBooking.id} created successfully.`);
  };
  const handleBookingDelete = (booking) => {
    if (role !== "admin") { notify("Only an administrator can delete bookings."); return; }
    const linkedPayments = payments.filter((payment) => payment.booking === booking.id).length;
    const paymentWarning = linkedPayments ? ` Its ${linkedPayments} linked payment record(s) will also be deleted.` : "";
    if (!window.confirm(`Delete booking ${booking.id} for ${booking.customer}?${paymentWarning} This cannot be undone.`)) return;
    setBookings(bookings.filter((item) => item.id !== booking.id));
    setPayments(payments.filter((payment) => payment.booking !== booking.id));
    if (!["Returned", "Cancelled"].includes(booking.status)) {
      const deletedBookingArticles = new Set(bookingArticleIds(booking));
      setArticles(articles.map((item) => {
        if (!deletedBookingArticles.has(item.id) || item.status === "Maintenance") return item;
        const hasOtherActiveBooking = bookings.some((other) => other.id !== booking.id && bookingArticleIds(other).includes(item.id) && !["Returned", "Cancelled"].includes(other.status));
        return { ...item, status: hasOtherActiveBooking ? "Booked" : "Available" };
      }));
    }
    setModal(null);
    notify(`Booking ${booking.id} deleted.`);
  };
  const handleCustomerSubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = { id: `CUS-${1043 + customers.length}`, name: form.get("name").trim(), phone: form.get("phone").trim(), phone2: form.get("phone2").trim(), address: form.get("address").trim(), city: form.get("city").trim(), cnic: form.get("cnic") || "—", bookings: 0, due: 0 };
    setCustomers([next, ...customers]); setModal(null); notify("Customer added successfully.");
  };
  const handleBookingCustomerCreate = (details) => {
    const next = {
      id: `CUS-${1043 + customers.length}`,
      name: details.name.trim(),
      phone: details.phone.trim(),
      phone2: details.phone2.trim(),
      address: details.address.trim(),
      city: details.city.trim(),
      cnic: details.cnic.trim() || "—",
      bookings: 0,
      due: 0,
    };
    setCustomers([next, ...customers]);
    notify(`${next.name} added to customers.`);
    return next;
  };
  const handlePaymentSubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const booking = bookings.find((item) => item.id === form.get("booking"));
    const amount = Number(form.get("amount"));
    if (amount <= 0) { notify("Enter a payment amount greater than zero."); return; }
    if (amount > Math.max(booking.amount - booking.paid, 0)) { notify("Payment cannot exceed the booking's remaining balance."); return; }
    setPayments([{ id: `PAY-${2082 + payments.length}`, booking: booking.id, customer: booking.customer, date: today, amount, method: form.get("method"), receivedBy: currentProfile.name }, ...payments]);
    setBookings(bookings.map((item) => item.id === booking.id ? { ...item, paid: item.paid + amount } : item));
    setModal(null); notify("Payment recorded successfully.");
  };
  const handleReturn = (bookingId) => {
    const booking = bookings.find((item) => item.id === bookingId);
    const bookingIds = bookingArticleIds(booking);
    const articleHasOtherActiveBooking = (articleId) => bookings.some((item) => item.id !== bookingId && bookingArticleIds(item).includes(articleId) && !["Returned", "Cancelled"].includes(item.status));
    setBookings(bookings.map((item) => item.id === bookingId ? { ...item, status: "Returned", actualReturn: today } : item));
    setArticles(articles.map((item) => bookingIds.includes(item.id) && item.status !== "Maintenance" ? { ...item, status: articleHasOtherActiveBooking(item.id) ? "Booked" : "Available" } : item));
    notify(`${bookingArticleTitles(booking)} marked as returned.`);
  };
  if (bootStage === "splash") return <SplashScreen />;
  if (!session) return <AccessScreen
    adminProfile={profile}
    adminPin={adminPin}
    salespeople={salespeople}
    onAdminSetup={handleAdminSetup}
    onSignIn={handleSignIn}
  />;
  const filteredQuery = query;
  const openArticleModal = () => setModal({ type: "article" });
  const openEditArticle = (article) => setModal({ type: "article-edit", article });
  const openEditBooking = (booking) => {
    if (role === "admin") setModal({ type: "booking-edit", booking });
  };
  const openCustomerModal = () => setModal({ type: "customer" });
  const openPaymentModal = () => setModal({ type: "payment" });
  const openAddStaff = () => {
    if (salespeople.length >= 6) {
      notify("All six salesperson profiles have been created. Remove one to add another.");
      return;
    }
    setModal({ type: "staff-create" });
  };
  const content = (() => {
    switch (activePage) {
      case "articles": return <ArticlesPage articles={articles} query={filteredQuery} onQueryChange={setQuery} onAdd={openArticleModal} onEdit={openEditArticle} />;
      case "bookings": return <BookingsPage bookings={bookings} query={filteredQuery} onQueryChange={setQuery} onNew={() => setModal({ type: "booking" })} onView={(booking) => setModal({ type: "booking-detail", booking })} isAdmin={role === "admin"} onEdit={openEditBooking} onDelete={handleBookingDelete} />;
      case "customers": return <CustomersPage customers={customers} query={filteredQuery} onQueryChange={setQuery} onAdd={openCustomerModal} />;
      case "payments": return <PaymentsPage payments={payments} bookings={bookings} query={filteredQuery} onQueryChange={setQuery} onAdd={openPaymentModal} />;
      case "returns": return <ReturnsPage bookings={bookings} onReturn={handleReturn} />;
      case "calendar": return <CalendarPage bookings={bookings} onNew={() => setModal({ type: "booking" })} />;
      case "reports": return <ReportsPage bookings={bookings} payments={payments} articles={articles} />;
      case "staff": return <StaffPage salespeople={salespeople} onAdd={openAddStaff} onEdit={(person) => setModal({ type: "staff-edit", person })} onToggle={handleStaffToggle} onDelete={handleStaffDelete} onChangeAdminPin={() => setModal({ type: "admin-pin" })} />;
      case "settings": return <SettingsPage language={language} onLanguageChange={setLanguage} fontSize={fontSize} onFontSizeChange={setFontSize} />;
      case "profile": return <ProfilePage profile={currentProfile} role={role} onEdit={() => setModal({ type: "profile-edit" })} />;
      default: return <Dashboard articles={articles} bookings={bookings} role={role} profile={currentProfile} onNavigate={nav} />;
    }
  })();

  return <div className="app-shell">
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span>DR</span><i>✦</i></div><div className="brand-name"><strong>Dulhan Rani</strong><span>BOUTIQUE MANAGEMENT</span></div><button className="sidebar-close icon-button" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-avatar">D</span><span><strong>Dulhan Rani Boutique</strong><small>SHEIKHUPURA, Pakistan</small></span><ChevronDown size={15} /></div>
      <nav className="side-nav">{visibleGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>
        {group.items.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${activePage === id ? "nav-active" : ""}`} onClick={() => nav(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{badge && <small className="nav-badge">{articles.length}</small>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="support-card"><span className="support-sparkle"><Sparkles size={16} /></span><strong>Need a hand?</strong><span>We’re here to help you get started.</span><button onClick={() => notify("Help center will be available soon.")}>Visit help center <ChevronRight size={14} /></button></div><button className="sidebar-profile" onClick={() => nav("profile")}><span className="avatar avatar-plum">{currentProfile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{currentProfile.name}</strong><small>{role === "admin" ? "Administrator" : "Salesperson"}</small></span><MoreHorizontal size={17} /></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageTitles[activePage]}</strong></div></div>
      <div className="topbar-right"><label className="global-search"><Search size={16} /><input placeholder="Search anything..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
        <div className="notification-wrap"><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18} /><i /></button>
          {notificationsOpen && <div className="notification-popover"><strong>Notifications</strong><div><span className="notification-dot" /><p><b>Return due today</b><small>Midnight Blue Pishwas · Sana Fatima</small></p></div><div><span className="notification-dot notification-orange" /><p><b>Payment follow-up</b><small>PKR 2,500 due · Ayesha Khan</small></p></div><button onClick={() => { setActivePage("returns"); setNotificationsOpen(false); }}>View all alerts <ChevronRight size={14} /></button></div>}</div>
        <span className="topbar-divider" /><ProfileMenu role={role} profile={currentProfile} onProfile={() => nav("profile")} onSignOut={signOut} /></div></header>
      <div className="page-content">{content}<footer className="app-footer"><span>© 2026 Dulhan Rani Boutique</span><span className={`sync-indicator sync-${syncStatus}`} role="status" title={syncError}><i />{syncStatus === "synced" ? "Cloud synced · local backup saved" : syncStatus === "syncing" ? "Syncing · local backup saved" : "Cloud unavailable · saved locally"}</span><span>Made for your boutique <span className="heart">♥</span></span></footer></div>
    </main>
    {modal?.type === "article" && <Modal title="Add new article" description="Add a rental piece to your boutique collection." onClose={() => setModal(null)}>
      <ArticleForm onSubmit={handleArticleSubmit} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "article-edit" && <Modal title="Edit article" description="Update article details or replace and crop its photo." onClose={() => setModal(null)}>
      <ArticleForm article={modal.article} onSubmit={handleArticleSubmit} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "booking" && <Modal title="Create a booking" description="Reserve an article and capture the rental details." onClose={() => setModal(null)} wide>
      <BookingForm articles={articles} customers={customers} onCreateCustomer={handleBookingCustomerCreate} onSubmit={handleBookingSubmit} onCancel={() => setModal(null)} onAddArticle={() => setModal({ ...modal, quickArticle: true })} addedArticleId={quickCreatedArticleId} onAddedArticleHandled={() => setQuickCreatedArticleId("")} />
    </Modal>}
    {modal?.type === "booking" && modal.quickArticle && <Modal title="Add an article" description="Create an inventory article, then it will be selected in this booking." onClose={() => setModal({ type: "booking" })}>
      <ArticleForm onSubmit={(event) => handleArticleSubmit(event, null, false)} onSaved={(article) => { setQuickCreatedArticleId(article.id); setModal({ type: "booking" }); }} onCancel={() => setModal({ type: "booking" })} />
    </Modal>}
    {modal?.type === "booking-edit" && role === "admin" && <Modal title="Edit booking" description={`Update reservation details for ${modal.booking.id}.`} onClose={() => setModal(null)} wide>
      <BookingForm key={modal.booking.id} booking={modal.booking} articles={articles} customers={customers} onCreateCustomer={handleBookingCustomerCreate} onSubmit={handleBookingSubmit} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "customer" && <Modal title="Add customer" description="Save customer contact details for future bookings." onClose={() => setModal(null)}>
      <form className="form-grid" onSubmit={handleCustomerSubmit}><Field label="Customer name *"><input name="name" placeholder="Full name" required /></Field><Field label="Phone number 1 *"><input name="phone" type="tel" placeholder="+92 300 0000000" required /></Field><Field label="Phone number 2 (optional)"><input name="phone2" type="tel" placeholder="+92 300 0000000" /></Field><Field label="CNIC number"><input name="cnic" placeholder="Optional" /></Field><Field label="Area / street address *"><input name="address" placeholder="e.g. Gulberg III" required /></Field><Field label="City *"><input name="city" list="customer-cities" placeholder="Select or type a city" required /><CityOptions /></Field><div className="modal-actions"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" icon={Plus}>Save customer</Button></div></form>
    </Modal>}
    {modal?.type === "payment" && <Modal title="Record a payment" description="Add a payment against an active rental booking." onClose={() => setModal(null)}>
      <form className="form-grid" onSubmit={handlePaymentSubmit}><Field label="Booking *" className="field-full"><select name="booking" required defaultValue=""><option value="" disabled>Choose booking</option>{bookings.filter((b) => b.amount > b.paid).map((booking) => <option key={booking.id} value={booking.id}>{booking.id} · {booking.customer} · Due {currency(booking.amount - booking.paid)}</option>)}</select></Field><Field label="Amount received (PKR) *"><input name="amount" type="number" min="1" required placeholder="2500" /></Field><Field label="Payment method *"><select name="method"><option>Cash</option><option>Bank transfer</option><option>JazzCash</option><option>Easypaisa</option></select></Field><div className="modal-actions"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" icon={Wallet}>Record payment</Button></div></form>
    </Modal>}
    {modal?.type === "profile-edit" && <Modal title="Edit my profile" description="Update the name and contact details shown on your account." onClose={() => setModal(null)}>
      <ProfileEditForm key={session.id || "admin"} profile={currentProfile} onSave={handleProfileSave} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "staff-create" && <Modal title="Create salesperson profile" description="Give this salesperson their own sign-in profile and PIN." onClose={() => setModal(null)}>
      <StaffForm onSave={handleStaffSave} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "staff-edit" && <Modal title="Manage salesperson profile" description={`Update ${modal.person.name}'s details or reset their PIN.`} onClose={() => setModal(null)}>
      <StaffForm key={modal.person.id} person={modal.person} onSave={handleStaffSave} onCancel={() => setModal(null)} onDelete={handleStaffDelete} />
    </Modal>}
    {modal?.type === "admin-pin" && <Modal title="Change administrator PIN" description="Confirm your current PIN before choosing a new one." onClose={() => setModal(null)}>
      <AdminPinForm onSave={handleAdminPinUpdate} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "booking-detail" && <Modal title="Booking details" description={`${modal.booking.id} · Created by ${modal.booking.staff}`} onClose={() => setModal(null)}>
      <div className="booking-detail"><div className="detail-highlight"><span><CalendarDays size={18} /></span><div><strong>{modal.booking.customer}</strong><small>{modal.booking.phone}</small></div><Status>{modal.booking.status}</Status></div>
        <div className="detail-lines"><div><span>Articles</span><strong>{bookingArticleTitles(modal.booking)}</strong><small>{bookingArticleLabels(modal.booking)}</small></div><div><span>Delivery date</span><strong>{readableDate(modal.booking.delivery)}</strong></div><div><span>Event date</span><strong>{readableDate(modal.booking.event)}</strong></div><div><span>Expected return</span><strong>{readableDate(modal.booking.returnDate)}</strong></div><div><span>Measurements</span><strong>{[modal.booking.chest && `Chest ${modal.booking.chest} in`, modal.booking.back && `Back ${modal.booking.back} in`, modal.booking.hip && `Hip ${modal.booking.hip} in`].filter(Boolean).join(" · ") || "Not provided"}</strong></div><div><span>Rental amount</span><strong>{currency(modal.booking.amount)}</strong></div><div><span>Remaining balance</span><strong className={modal.booking.amount > modal.booking.paid ? "due-text" : "paid-text"}>{currency(Math.max(modal.booking.amount - modal.booking.paid, 0))}</strong></div></div>
        <Button variant="outline" icon={FileText} onClick={() => window.print()}>Print booking receipt</Button>{role === "admin" && <div className="booking-detail-admin-actions"><Button variant="outline" icon={Pencil} onClick={() => openEditBooking(modal.booking)}>Edit booking</Button><Button variant="outline" icon={Trash2} onClick={() => handleBookingDelete(modal.booking)}>Delete booking</Button></div>}</div></Modal>}
    {toast && <div className="toast" role="status" aria-live="polite"><span><Check size={18} /></span><strong>{toast}</strong><button onClick={() => { window.clearTimeout(toastTimer.current); setToast(""); }} aria-label="Dismiss"><X size={17} /></button></div>}
  </div>;
}

function BookingForm({ booking, articles, customers, onCreateCustomer, onSubmit, onCancel, onAddArticle, addedArticleId, onAddedArticleHandled }) {
  const [selectedArticleIds, setSelectedArticleIds] = useState(booking ? bookingArticleIds(booking) : []);
  const selectedArticles = articles.filter((item) => selectedArticleIds.includes(item.id));
  const [articleSearch, setArticleSearch] = useState("");
  const initialCustomerId = booking?.customerId || customers.find((customer) => customer.name === booking?.customer)?.id || "";
  const [customerChoice, setCustomerChoice] = useState(initialCustomerId);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", phone2: "", address: "", city: "", cnic: "" });
  const [customerError, setCustomerError] = useState("");
  const [amount, setAmount] = useState(String(booking?.amount ?? 0));
  const [paid, setPaid] = useState(String(booking?.paid ?? 0));
  useEffect(() => {
    if (!addedArticleId || selectedArticleIds.includes(addedArticleId)) return;
    const updatedIds = [...selectedArticleIds, addedArticleId];
    setSelectedArticleIds(updatedIds);
    setAmount(String(articles.filter((item) => updatedIds.includes(item.id)).reduce((sum, item) => sum + item.price, 0)));
    setArticleSearch("");
    onAddedArticleHandled();
  }, [addedArticleId]);
  const createCustomer = () => {
    if (!newCustomer.name.trim() || !newCustomer.phone.trim() || !newCustomer.address.trim() || !newCustomer.city.trim()) {
      setCustomerError("Name, first phone number, address, and city are required.");
      return;
    }
    const created = onCreateCustomer(newCustomer);
    setCustomerChoice(created.id);
    setNewCustomer({ name: "", phone: "", phone2: "", address: "", city: "", cnic: "" });
    setCustomerError("");
    setShowNewCustomer(false);
  };
  return <form className="form-grid" onSubmit={(event) => onSubmit(event, booking?.id || null)}>
    <div className="booking-article-picker field-full"><strong>Select articles * <span>Search by article name or number. Choose one or more items.</span></strong>
      <label className="booking-article-search"><Search size={15} /><input type="search" aria-label="Search articles for booking" placeholder="Type article name or number..." value={articleSearch} onChange={(event) => setArticleSearch(event.target.value)} /></label>
      <div className="booking-article-options">{articles.filter((item) => (item.status !== "Maintenance" || selectedArticleIds.includes(item.id))
        && (!articleSearch.trim() || `${item.id} ${item.name} ${item.category}`.toLowerCase().includes(articleSearch.trim().toLowerCase()))
        && (articleSearch.trim() || selectedArticleIds.includes(item.id))).map((article) => <label className={`booking-article-option${selectedArticleIds.includes(article.id) ? " selected" : ""}`} key={article.id}>
        <input type="checkbox" name="articles" value={article.id} checked={selectedArticleIds.includes(article.id)} onChange={(event) => {
          const nextIds = event.target.checked ? [...selectedArticleIds, article.id] : selectedArticleIds.filter((id) => id !== article.id);
          setSelectedArticleIds(nextIds);
          setAmount(String(articles.filter((item) => nextIds.includes(item.id)).reduce((sum, item) => sum + item.price, 0)));
        }} />
        {article.photo ? <img src={article.photo} alt="" /> : <span className="booking-article-option-placeholder"><Shirt size={18} /></span>}
        <span><b>{article.name}</b><small>{article.id} · {article.category}</small></span><strong>{currency(article.price)}</strong>
      </label>)}
      {!articleSearch.trim() && selectedArticleIds.length === 0 && <p className="booking-article-empty">Start typing to search your article collection.</p>}
      {articleSearch.trim() && !articles.some((item) => (item.status !== "Maintenance" || selectedArticleIds.includes(item.id)) && `${item.id} ${item.name} ${item.category}`.toLowerCase().includes(articleSearch.trim().toLowerCase())) && <p className="booking-article-empty">No matching articles found.</p>}
      </div>
      {selectedArticles.length > 0 && <p className="booking-selected-count">{selectedArticles.length} article{selectedArticles.length === 1 ? "" : "s"} selected</p>}
      <Button type="button" variant="outline" icon={Plus} onClick={onAddArticle}>Add new article to collection</Button>
    </div>
    <div className="booking-customer-field">
      <Field label="Customer *"><select name="customer" required value={customerChoice} onChange={(event) => {
        const choice = event.target.value;
        if (choice === "__new_customer__") {
          setCustomerChoice("");
          setShowNewCustomer(true);
          setCustomerError("");
          return;
        }
        setCustomerChoice(choice);
      }}><option value="" disabled>Select a customer</option><option value="__new_customer__">＋ New customer — add now</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.phone}</option>)}</select></Field>
      <button className="inline-add-customer" type="button" onClick={() => { setShowNewCustomer(!showNewCustomer); setCustomerError(""); }}><Plus size={13} />{showNewCustomer ? "Cancel new customer" : "New customer"}</button>
      {showNewCustomer && <div className="inline-customer-form">
        <div className="inline-customer-heading"><UserRound size={15} /><strong>Quick add customer</strong></div>
        <div className="inline-customer-grid">
          <input aria-label="New customer name" placeholder="Customer name *" value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} />
          <input aria-label="New customer phone" type="tel" placeholder="Phone number 1 *" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} />
          <input aria-label="New customer second phone" type="tel" placeholder="Phone number 2 (optional)" value={newCustomer.phone2} onChange={(event) => setNewCustomer({ ...newCustomer, phone2: event.target.value })} />
          <input aria-label="New customer address" placeholder="Area / street address *" value={newCustomer.address} onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })} />
          <input aria-label="New customer city" list="customer-cities" placeholder="City: select or type *" value={newCustomer.city} onChange={(event) => setNewCustomer({ ...newCustomer, city: event.target.value })} />
          <CityOptions />
          <input aria-label="New customer CNIC" placeholder="CNIC (optional)" value={newCustomer.cnic} onChange={(event) => setNewCustomer({ ...newCustomer, cnic: event.target.value })} />
        </div>
        {customerError && <p className="form-error" role="alert">{customerError}</p>}
        <button className="button button-outline inline-save-customer" type="button" onClick={createCustomer}><Check size={13} />Save & select customer</button>
      </div>}
    </div>
    <div className="booking-measurements field-full"><strong>Customer measurements <span>(optional · inches)</span></strong><div><Field label="Chest"><input name="chest" type="number" min="0" step="0.1" defaultValue={booking?.chest || ""} placeholder="Chest size" /></Field><Field label="Back"><input name="back" type="number" min="0" step="0.1" defaultValue={booking?.back || ""} placeholder="Back size" /></Field><Field label="Hip"><input name="hip" type="number" min="0" step="0.1" defaultValue={booking?.hip || ""} placeholder="Hip size" /></Field></div></div>
    <Field label="Delivery / pickup date *"><input type="date" name="delivery" min={booking ? undefined : today} defaultValue={booking?.delivery || ""} required /></Field>
    <Field label="Event / wearing date *"><input type="date" name="event" min={booking ? undefined : today} defaultValue={booking?.event || ""} required /></Field>
    <Field label="Expected return date *"><input type="date" name="returnDate" min={booking ? undefined : today} defaultValue={booking?.returnDate || ""} required /></Field>
    <Field label="Agreed rental price (PKR) *"><input type="number" name="amount" min="1" placeholder="4500" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      {selectedArticles.length > 0 && <small className="suggested-price">Suggested total for {selectedArticles.length} article{selectedArticles.length === 1 ? "" : "s"}: {currency(selectedArticles.reduce((sum, item) => sum + item.price, 0))}</small>}</Field>
    <Field label={booking ? "Advance received (PKR)" : "Advance payment (PKR)"}><input type="number" name="paid" min="0" value={paid} onChange={(event) => setPaid(event.target.value)} readOnly={Boolean(booking)} />{booking && <small className="suggested-price">Payments are managed from the Payments page.</small>}</Field>
    {!booking && <Field label="Payment method"><select name="method"><option>Cash</option><option>Bank transfer</option><option>JazzCash</option><option>Easypaisa</option></select></Field>}
    <div className="booking-balance field-full"><span>Total rental <strong>{currency(amount)}</strong></span><span>Balance after advance <strong>{currency(Math.max(Number(amount || 0) - Number(paid || 0), 0))}</strong></span></div>
    <Field label="Special instructions" className="field-full"><textarea name="notes" rows="2" defaultValue={booking?.notes || ""} placeholder="Fitting notes, alterations, or other details..." /></Field>
    <div className="form-hint field-full"><ShieldCheck size={15} /><span>Availability is checked against existing reservations before confirming.</span></div>
    <div className="modal-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={booking ? Check : CalendarDays}>{booking ? "Save changes" : "Confirm booking"}</Button></div>
  </form>;
}

function CityOptions() {
  return <datalist id="customer-cities">{["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Sheikhupura", "Gujrat", "Bahawalpur", "Sargodha", "Hyderabad"].map((city) => <option value={city} key={city} />)}</datalist>;
}

function ArticleForm({ article, onSubmit, onCancel, onSaved }) {
  const [photo, setPhoto] = useState(article?.photo || "");
  const [priceMin, setPriceMin] = useState(String(article?.priceMin ?? Math.max(1000, (article?.price || 4500) - 500)));
  const [priceMax, setPriceMax] = useState(String(article?.priceMax ?? (article?.price || 4500) + 500));
  const submit = (event) => {
    const savedArticle = onSubmit(event, article?.id || null);
    if (savedArticle && !article) onSaved?.(savedArticle);
  };
  return <form className="form-grid" onSubmit={submit}>
    <Field label="Article number *"><input name="id" defaultValue={article?.id || ""} readOnly={Boolean(article)} placeholder="e.g. DRB-BRT-032" required /></Field>
    <Field label="Article name *"><input name="name" defaultValue={article?.name || ""} placeholder="e.g. Rose Gold Bridal Lehnga" required /></Field>
    <Field label="Category *"><select name="category" required defaultValue={article?.category || ""}><option value="" disabled>Select category</option><option>Bridal Wear</option><option>Party Wear</option><option>Formal Wear</option><option>Accessories</option></select></Field>
    <Field label="Availability"><select name="status" defaultValue={article?.status || "Available"}><option>Available</option><option>Booked</option><option>Maintenance</option></select></Field>
    <Field label="Suggested rental minimum (PKR) *"><input name="priceMin" type="number" min="0" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} placeholder="3000" required /></Field>
    <Field label="Suggested rental maximum (PKR) *"><input name="priceMax" type="number" min="0" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} placeholder="5000" required /></Field>
    <Field label="Minimum order price (PKR) *"><input name="minOrder" type="number" min="0" defaultValue={article?.minOrder ?? ""} placeholder="20000" required /></Field>
    <PhotoUpload value={photo} onChange={setPhoto} />
    <input className="form-hidden" type="hidden" name="photoData" value={photo} readOnly />
    <input className="form-hidden" type="hidden" name="color" value={article?.color || "rose"} readOnly />
    <div className="modal-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={article ? Check : Plus}>{article ? "Save article" : "Add article"}</Button></div>
  </form>;
}

function SplashScreen() {
  return <main className="splash-screen"><div className="splash-halo" /><div className="splash-content">
    <div className="splash-mark"><span>DR</span><i>✦</i></div>
    <p className="splash-overline">WELCOME TO</p><h1>Dulhan Rani</h1><p className="splash-subtitle">BOUTIQUE MANAGEMENT</p>
    <div className="splash-loader"><span /></div>
  </div><span className="splash-copyright">SHEIKHUPURA · Pakistan</span></main>;
}
