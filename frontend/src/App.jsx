import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft, Bell, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleDollarSign, Clock3, Download, FileText, LayoutDashboard,
  Gem, LogOut, Menu, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Shirt, ShoppingCart,
  SlidersHorizontal, Sparkles, Users, Wallet, X, UserRound, Truck, LockKeyhole,
  RotateCcw, RefreshCw, ChartNoAxesCombined, CreditCard, Eye, Pencil, AlertTriangle, Trash2,
  CheckCircle2, XCircle, Phone,
} from "lucide-react";
import { seedArticles, seedBookings, seedCustomers, seedPayments } from "./data.js";
import AccessScreen from "./AccessScreen.jsx";
import PhotoUpload from "./PhotoUpload.jsx";
import { DateInput, Field } from "./shared.jsx";
import {
  createStaff, deleteStaff, loadAuthProfiles, loadManagedProfiles, permanentlyDeleteStaff, restoreSession, restoreStaff, saveProfile,
  setupAdmin, signIn, signOut as requestSignOut, updateAdminPin, validPin,
} from "./auth.js";
import {
  createApprovalRequest, itemChanges, loadApprovalRequests, loadCollection, mergeChanges,
  persistCollectionChanges, refreshCollection, reviewApprovalRequest,
} from "./dataSync.js";
import { localizeNode, translateText } from "./i18n.js";

const currency = (amount) => `PKR ${Number(amount || 0).toLocaleString("en-PK")}`;
const defaultBusinessSettings = {
  name: "Dulhan Rani Boutique",
  phone: "",
  email: "",
  address: "",
  receiptFooter: "Thank you for choosing Dulhan Rani Boutique.",
};
const defaultNotificationSettings = { bookings: true, payments: true, returns: true };
const emptyProfile = { name: "", email: "", phone: "" };
const articleCategories = ["Bridal Wear", "Party Wear", "Groom Wear", "Men's Wear", "Jewellery Set"];
const categoriesForArticles = (articles) => [
  ...articleCategories,
  ...new Set(articles.map((article) => article.category).filter((category) => category && !articleCategories.includes(category))),
];
const categoryArticlePrefixes = {
  "Bridal Wear": "BW",
  "Party Wear": "PW",
  "Groom Wear": "GW",
  "Men's Wear": "MW",
  "Jewellery Set": "JS",
};
const nextCategoryArticleNumber = (articles, category) => {
  const prefix = categoryArticlePrefixes[category]
    || category.split(/[^a-z0-9]+/i).filter(Boolean).map((part) => part[0]).join("").toUpperCase()
    || "ART";
  const usedIds = new Set(articles.map((article) => article.id.toLowerCase()));
  const categoryArticles = articles.filter((article) => article.category === category);
  const highestExistingNumber = categoryArticles.reduce((highest, article) => {
    const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(article.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  let number = Math.max(categoryArticles.length, highestExistingNumber);
  let candidate;
  do {
    candidate = `${prefix}-${String(++number).padStart(3, "0")}`;
  } while (usedIds.has(candidate.toLowerCase()));
  return candidate;
};
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const bookingArticleIds = (booking) => booking.articles?.map((article) => typeof article === "string" ? article : article.id) || (booking.article ? [booking.article] : []);
const bookingArticleNames = (booking) => booking.articles?.map((article) => typeof article === "string" ? article : article.name).filter(Boolean) || (booking.articleName ? [booking.articleName] : []);
const bookingArticleLabels = (booking) => bookingArticleIds(booking).join(", ");
const bookingArticleTitles = (booking) => bookingArticleNames(booking).join(", ");
const validatePakistaniPhone = (phone) => {
  const compact = phone.trim().replace(/[\s()-]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (compact.startsWith("03")) {
    if (digits.length < 11) return `A number starting with 03 needs 11 digits total; add ${11 - digits.length} more digit${11 - digits.length === 1 ? "" : "s"}.`;
    if (digits.length > 11) return `A number starting with 03 needs 11 digits total; remove ${digits.length - 11} extra digit${digits.length - 11 === 1 ? "" : "s"}.`;
    return /^03\d{9}$/.test(digits) ? "" : "After 03, the mobile number must contain 9 digits.";
  }
  if (compact.startsWith("+92")) {
    const nationalDigits = digits.slice(2);
    if (nationalDigits.length < 10) return `After +92, enter 10 digits; add ${10 - nationalDigits.length} more digit${10 - nationalDigits.length === 1 ? "" : "s"}.`;
    if (nationalDigits.length > 10) return `After +92, enter 10 digits; remove ${nationalDigits.length - 10} extra digit${nationalDigits.length - 10 === 1 ? "" : "s"}.`;
    return /^3\d{9}$/.test(nationalDigits) ? "" : "After +92, the mobile number must start with 3 and contain 10 digits.";
  }
  return "Use 11 digits starting with 03, or +92 followed by 10 mobile digits.";
};
const bookingArticleRecords = (booking, inventory) => {
  const savedArticles = booking.articles?.length
    ? booking.articles
    : String(booking.article || "").split(",").map((id) => id.trim()).filter(Boolean);
  return savedArticles.map((savedArticle, index) => {
    const id = typeof savedArticle === "string" ? savedArticle : savedArticle.id;
    const inventoryArticle = inventory.find((article) => article.id === id);
    const name = typeof savedArticle === "string" ? inventoryArticle?.name : savedArticle.name;
    return {
      id: id || `article-${index + 1}`,
      name: name || booking.articleName?.split(",")[index]?.trim() || id || "Article",
      photo: (typeof savedArticle === "string" ? "" : savedArticle.photo) || inventoryArticle?.photo || "",
      category: (typeof savedArticle === "string" ? "" : savedArticle.category) || inventoryArticle?.category || "",
    };
  });
};
const deliveryPrepBookings = (bookings, articles, dateRange) => bookings
  .filter((booking) => booking.delivery >= dateRange.from
    && booking.delivery <= dateRange.to
    && !["Out", "Returned", "Cancelled"].includes(booking.status))
  .map((booking) => ({ ...booking, deliveryArticles: bookingArticleRecords(booking, articles) }))
  .sort((left, right) => left.delivery.localeCompare(right.delivery) || left.customer.localeCompare(right.customer));
const bookingHasJewellerySet = (booking, inventory) => bookingArticleRecords(booking, inventory)
  .some((article) => article.category === "Jewellery Set");
const dateAfter = (date, days) => {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const randomRecordSuffix = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
const createRecordId = (prefix) => `${prefix}-${randomRecordSuffix()}`;
const stored = (key, fallback) => {
  const value = localStorage.getItem(`drb-${key}`);
  return value ? JSON.parse(value) : fallback;
};
const save = (key, value) => localStorage.setItem(`drb-${key}`, JSON.stringify(value));
const workspaceDataVersion = "2";
if (typeof window !== "undefined" && localStorage.getItem("drb-data-version") !== workspaceDataVersion) {
  Object.keys(localStorage)
    .filter((key) => key.startsWith("drb-"))
    .forEach((key) => localStorage.removeItem(key));
  localStorage.setItem("drb-data-version", workspaceDataVersion);
}
const readableDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
  : "—";

const navGroups = [
  { label: "WORKSPACE", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", icon: CalendarDays, badge: "bookings" },
    { id: "tomorrow", label: "Delivery prep", icon: Truck },
    { id: "payments", label: "Payments", icon: Wallet },
    { id: "articles", label: "Articles", icon: Shirt, badge: "6" },
    { id: "sales", label: "Sales", icon: ShoppingCart },
    { id: "jewellery-bookings", label: "Jewellery Set Booking", icon: Gem },
    { id: "customers", label: "Customers", icon: Users },
  ] },
  { label: "OPERATIONS", items: [
    { id: "returns", label: "Returns & tracking", icon: RotateCcw },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
  ] },
  { label: "MANAGEMENT", adminOnly: true, items: [
    { id: "approvals", label: "Approvals", icon: CheckCircle2, badge: "approvals" },
    { id: "recently-deleted", label: "Recently deleted", icon: Trash2 },
    { id: "reports", label: "Reports", icon: ChartNoAxesCombined },
    { id: "staff", label: "Staff & roles", icon: ShieldCheck },
    { id: "settings", label: "Settings", icon: Settings },
  ] },
];

function useSyncedData(collection, fallback, enabled) {
  const [value, setValue] = useState(() => stored(collection, fallback));
  const valueRef = useRef(value);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
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
      loadCollection(collection)
        .then((remote) => applyRemote(remote, original, originalRevision))
        .catch(() => {});
    };

    const refresh = () => {
      const revision = revisionRef.current;
      refreshCollection(collection)
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
  }, [collection, enabled]);

  const update = (next) => {
    const previous = valueRef.current;
    const resolved = typeof next === "function" ? next(previous) : next;
    valueRef.current = resolved;
    revisionRef.current += 1;
    setValue(resolved);
    save(collection, resolved);
    if (enabled) persistCollectionChanges(collection, previous, resolved).catch(() => {});
  };

  return [value, update];
}

function Status({ children, className = "" }) {
  const normalized = String(children).toLowerCase();
  const statusColor = normalized.includes("available") || normalized.includes("returned") || normalized === "paid" || normalized === "ready"
    ? "green"
    : normalized.includes("out") || normalized.includes("due") || normalized.includes("maintenance") || normalized.includes("overdue")
      ? "amber"
      : normalized.includes("cancel") ? "gray" : "rose";
  return <span className={`status status-${statusColor}${className ? ` ${className}` : ""}`}><i />{children}</span>;
}

function Button({ children, variant = "primary", icon: Icon, onClick, type = "button", className = "", ...props }) {
  return <button type={type} className={`button button-${variant} ${className}`.trim()} onClick={onClick} {...props}>
    {Icon && <Icon size={16} strokeWidth={2} />}{children}
  </button>;
}

function PageHeader({ eyebrow, title, description, action, actionLabel, actionIcon: ActionIcon = Plus, onAction, actionClassName = "" }) {
  return <div className="page-heading">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>
    {action && <Button icon={ActionIcon} onClick={onAction} className={actionClassName}>{actionLabel}</Button>}
  </div>;
}

function Modal({ title, description, onClose, children, wide = false, className = "" }) {
  return <div className={`modal-backdrop ${className ? `${className}-backdrop` : ""}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? "modal-wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}

function Dashboard({ articles, bookings, payments, role, profile, onNavigate }) {
  const due = bookings
    .filter((booking) => !["Returned", "Cancelled"].includes(booking.status))
    .reduce((sum, booking) => sum + Math.max(booking.amount - booking.paid, 0), 0);
  const recent = [...bookings].slice(0, 4);
  const schedule = bookings.flatMap((booking) => [
    ...(booking.delivery === today ? [{ booking, label: "Delivery", tone: "blue" }] : []),
    ...(booking.returnDate === today ? [{ booking, label: "Expected return", tone: "orange" }] : []),
  ]);
  const currentYear = new Date().getFullYear();
  const monthlyRevenue = Array.from({ length: 12 }, (_, month) => payments
    .filter((payment) => {
      const date = new Date(`${payment.date}T00:00:00`);
      return date.getFullYear() === currentYear && date.getMonth() === month;
    })
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const highestRevenue = Math.max(...monthlyRevenue);
  const maintenanceCount = articles.filter((item) => item.status === "Maintenance").length;
  return <>
    <PageHeader eyebrow={`${role === "admin" ? "ADMINISTRATOR" : "SALESPERSON"} OVERVIEW`} title={`Good morning, ${profile.name.split(" ")[0]} ✨`}
      description="Here’s what’s happening at your boutique today." action actionLabel="Create booking" actionIcon={Plus} onAction={() => onNavigate("new-booking")} actionClassName="dashboard-create-booking" />
    <div className="welcome-strip">
      <div className="welcome-icon"><Sparkles size={21} /></div>
      <div><strong>Your boutique at a glance</strong><span>Stay on top of today’s fittings, deliveries and returns.</span></div>
      <button onClick={() => onNavigate("calendar")}>View calendar <ChevronRight size={16} /></button>
      <span className="strip-decoration">✦</span>
    </div>
    <div className="stats-grid">
      <StatCard label="Total articles" value={articles.length} note="Across all categories" icon={Shirt} tone="plum" />
      <StatCard label="Active bookings" value={bookings.filter((booking) => !["Returned", "Cancelled"].includes(booking.status)).length} note="Currently in your diary" icon={CalendarDays} tone="blue" />
      <StatCard label="Today's deliveries" value={bookings.filter((booking) => booking.delivery === today && booking.status === "Confirmed").length} note="Scheduled for today" icon={Truck} tone="orange" trend="View checklist" onTrendClick={() => onNavigate("today-deliveries")} />
      <StatCard label="Outstanding balance" value={currency(due)} note="Across active bookings" icon={CircleDollarSign} tone="green" />
    </div>
    <div className="dashboard-grid">
      <section className="panel revenue-panel">
        <div className="panel-heading"><div><h2>Revenue overview</h2><p>Rental income collected this year</p></div></div>
        <div className="revenue-total"><strong>{currency(monthlyRevenue.reduce((sum, amount) => sum + amount, 0))}</strong><small>{currentYear}</small></div>
        <div className="chart" aria-label="Monthly revenue chart">
          {monthlyRevenue.map((amount, index) =>
            <div className="chart-column" key={index}><div className={`chart-bar ${index === new Date().getMonth() ? "chart-bar-active" : ""}`} style={{ height: `${highestRevenue ? Math.max((amount / highestRevenue) * 100, 4) : 4}%` }} /><span>{new Date(currentYear, index, 1).toLocaleDateString("en", { month: "short" })}</span></div>)}
        </div>
      </section>
      <section className="panel today-panel">
        <div className="panel-heading"><div><h2>Today’s schedule</h2><p>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p></div>
          <button className="text-button" onClick={() => onNavigate("bookings")}>See all <ChevronRight size={15} /></button></div>
        {schedule.length
          ? <div className="timeline">{schedule.map(({ booking, label, tone }) => <TimelineItem key={`${booking.id}-${label}`} time={label} title={booking.customer} detail={bookingArticleTitles(booking) || booking.id} tone={tone} />)}</div>
          : <EmptyState title="Nothing scheduled today" detail="Today's deliveries and returns will appear here when you add bookings." />}
      </section>
    </div>
    <div className="dashboard-grid lower-grid">
      <section className="panel table-panel">
        <div className="panel-heading"><div><h2>Recent bookings</h2><p>Your latest rental activity</p></div>
          <button className="text-button" onClick={() => onNavigate("bookings")}>View bookings <ChevronRight size={15} /></button></div>
        <div className="table-scroll"><table><thead><tr><th>BOOKING</th><th>CUSTOMER</th><th>ARTICLE</th><th>BOOKING DATE</th><th>DELIVERY DATE</th><th>RETURN DATE</th><th>STATUS</th></tr></thead>
          <tbody>{recent.map((booking) => <tr key={booking.id}><td className="strong-cell">{booking.id}</td><td>{booking.customer}</td><td>{bookingArticleLabels(booking)}</td><td>{readableDate(booking.bookingDate)}</td><td>{readableDate(booking.delivery)}</td><td>{readableDate(booking.returnDate)}</td><td><Status>{booking.status}</Status></td></tr>)}</tbody></table>
          {!recent.length && <EmptyState title="No bookings yet" detail="Your recent bookings will appear here." />}
        </div>
      </section>
      <section className="panel stock-panel">
        <div className="panel-heading"><div><h2>Article availability</h2><p>Inventory at a glance</p></div><button className="text-button" onClick={() => onNavigate("articles")}>Manage <ChevronRight size={15} /></button></div>
        <div className="availability-list">
          <Availability label="Available" count={articles.filter((item) => item.status === "Available").length} total={articles.length} tone="green" />
          <Availability label="Currently rented" count={bookings.filter((item) => item.status === "Out").length} total={articles.length} tone="plum" />
          <Availability label="In maintenance" count={articles.filter((item) => item.status === "Maintenance").length} total={articles.length} tone="orange" />
        </div>
        <div className="stock-note"><AlertTriangle size={15} /><span>{maintenanceCount ? `${maintenanceCount} article${maintenanceCount === 1 ? "" : "s"} need attention before the next booking.` : "No articles currently need attention."}</span></div>
      </section>
    </div>
  </>;
}

function StatCard({ label, value, note, icon: Icon, tone, trend, onTrendClick }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon icon-${tone}`}><Icon size={18} /></span></div>
    <strong className="stat-value">{value}</strong><div className="stat-footer"><span>{note}</span>
      {onTrendClick ? <button className="stat-trend stat-trend-button" onClick={onTrendClick}>{trend}</button> : <span className="stat-trend">{trend}</span>}</div></article>;
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
  const categories = categoriesForArticles(articles);
  const filtered = articles.filter((article) => `${article.id} ${article.name} ${article.category}`.toLowerCase().includes(query.toLowerCase())
    && (category === "All categories" || article.category === category)
    && (availability === "All statuses" || article.status === availability));
  return <>
    <PageHeader eyebrow="INVENTORY" title="Article collection" description="Manage your rental pieces, photos, pricing and availability." action actionLabel="Add new article" onAction={onAdd} />
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input placeholder="Search article number or name..." value={query} onChange={(event) => onQueryChange(event.target.value)} /></div>
      <div className="toolbar-controls"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
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
      <div className="article-meta"><span>Suggested rental</span><strong>{currency(article.priceMin ?? article.price)} <small>/ booking</small></strong></div>
      <div className="article-card-footer"><span>Min. order <strong>{currency(article.minOrder)}</strong></span><button aria-label={`Edit ${article.name}`} onClick={() => onEdit(article)}><Pencil size={15} /></button></div></div></article>;
}

function BookingsPage({ bookings, articles, query, onQueryChange, onNew, onView, isAdmin, onEdit, onDelete, onStatusChange, onRecordPayment, jewelleryOnly = false }) {
  const [filter, setFilter] = useState("All bookings");
  const [deliveryDate, setDeliveryDate] = useState("");
  const pageBookings = jewelleryOnly ? bookings.filter((booking) => bookingHasJewellerySet(booking, articles)) : bookings;
  const visibleBookings = pageBookings;
  const filtered = visibleBookings.filter((item) => `${item.id} ${item.customer} ${bookingArticleLabels(item)} ${bookingArticleTitles(item)}`.toLowerCase().includes(query.toLowerCase())
    && (filter === "All bookings" || item.status === filter)
    && (!deliveryDate || (item.delivery >= deliveryDate && item.delivery <= dateAfter(deliveryDate, 1))));
  return <>
    <PageHeader eyebrow="RENTAL MANAGEMENT" title={jewelleryOnly ? "Jewellery Set Booking" : "Bookings"} description={jewelleryOnly ? "View bookings that include a jewellery set, alone or with an outfit." : "Track reservations, delivery dates and returns."} action actionLabel="New booking" onAction={onNew} />
    <div className="booking-stats"><MiniMetric label="All bookings" value={visibleBookings.length} /><MiniMetric label="Confirmed" value={visibleBookings.filter((b) => b.status === "Confirmed").length} tone="plum" /><MiniMetric label="Currently out" value={visibleBookings.filter((b) => b.status === "Out").length} tone="orange" /><MiniMetric label="Returned" value={visibleBookings.filter((b) => b.status === "Returned").length} tone="green" /></div>
    <section className="booking-date-filter-panel"><div><strong>Filter bookings by delivery date</strong><span>Select a date to show its bookings and the following day.</span></div><label><CalendarDays size={16} /><DateInput ariaLabel="Filter bookings from selected delivery date through next day" value={deliveryDate} onChange={setDeliveryDate} /></label>{deliveryDate && <><span className="booking-date-range">Showing {readableDate(deliveryDate)} – {readableDate(dateAfter(deliveryDate, 1))}</span><Button variant="outline" onClick={() => setDeliveryDate("")}>Clear date</Button></>}</section>
    <div className="bookings-toolbar">
      <div className="toolbar-controls bookings-toolbar-controls"><select aria-label="Filter bookings by status" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All bookings</option><option>Confirmed</option><option>Out</option><option>Returned</option></select>
        <Button variant="outline" icon={Download} onClick={() => window.print()}>Export</Button></div>
      <div className="toolbar-search bookings-toolbar-search"><Search size={16} /><input aria-label="Search bookings" placeholder="Search booking, customer or article..." value={query} onChange={(event) => onQueryChange(event.target.value)} /></div>
    </div>
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>BILL</th><th>BOOKING ID</th><th>CUSTOMER</th><th>ARTICLES</th><th>BOOKING DATE</th><th>DELIVERY</th><th>RETURN</th><th>AMOUNT / DUE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
      <tbody>{filtered.map((booking) => {
        const articleRecords = bookingArticleRecords(booking, articles);
        const firstPhoto = articleRecords.find((article) => article.photo)?.photo;
        return <tr key={booking.id} onClick={() => onView(booking)} className="clickable-row">
          <td><div className="booking-bill-actions"><button className="booking-receipt-action" onClick={(event) => { event.stopPropagation(); onView(booking); }} aria-label={`View bill for booking ${booking.id}`}><Eye size={15} /><span>View bill</span></button>
            {booking.status === "Confirmed" && booking.amount > booking.paid && <Button variant="small" icon={Wallet} onClick={(event) => { event.stopPropagation(); onRecordPayment(booking); }}>Receive balance</Button>}
            {booking.status === "Confirmed" && booking.amount <= booking.paid && <Button variant="small" icon={Truck} onClick={(event) => { event.stopPropagation(); onStatusChange(booking, "Out"); }}>Mark picked up</Button>}
            {booking.status === "Out" && <Button variant="small" icon={Check} onClick={(event) => { event.stopPropagation(); onStatusChange(booking, "Returned"); }}>Confirm return</Button>}</div></td>
          <td className="strong-cell">{booking.id}</td><td><strong>{booking.customer}</strong><small className="sub-cell">{booking.phone}</small></td>
          <td><div className="booking-article-cell">{firstPhoto ? <img src={firstPhoto} alt="" /> : <span className="booking-article-thumbnail-placeholder"><Shirt size={16} /></span>}<span><b className="article-id">{bookingArticleLabels(booking) || "No article"}</b><small className="sub-cell">{bookingArticleTitles(booking) || "—"}</small></span></div></td>
          <td>{readableDate(booking.bookingDate)}</td><td>{readableDate(booking.delivery)}</td><td>{readableDate(booking.returnDate)}</td>
          <td><strong>{currency(booking.amount)}</strong><small className="sub-cell">{booking.amount > booking.paid ? `${currency(booking.amount - booking.paid)} due` : "Paid"}</small></td>
          <td><Status>{booking.status}</Status></td><td><div className="booking-row-actions">
            {isAdmin && <div className="booking-admin-actions"><button className="icon-button" onClick={(event) => { event.stopPropagation(); onEdit(booking); }} aria-label={`Edit booking ${booking.id}`}><Pencil size={15} /></button><button className="icon-button booking-delete-button" onClick={(event) => { event.stopPropagation(); onDelete(booking); }} aria-label={`Delete booking ${booking.id}`}><Trash2 size={15} /></button></div>}
          </div></td></tr>;
      })}</tbody></table>
      {filtered.length === 0 && <EmptyState title={jewelleryOnly ? "No jewellery set bookings found" : "No bookings found"} detail={jewelleryOnly ? "Bookings with a jewellery set will appear here." : "Try another search or add your first booking."} />}</div></section>
  </>;
}

function SalesPage({ sales, query, onQueryChange, onNew, onEdit, onDelete }) {
  const filtered = sales.filter((sale) => `${sale.id} ${sale.customer} ${sale.itemDescription}`.toLowerCase().includes(query.toLowerCase()));
  const total = filtered.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
  const received = filtered.reduce((sum, sale) => sum + Number(sale.paid || 0), 0);
  return <>
    <PageHeader eyebrow="RETAIL SALES" title="Sales" description="Record and review boutique sales separately from rental bookings." action actionLabel="Record sale" actionIcon={Plus} onAction={onNew} />
    <div className="booking-stats"><MiniMetric label="Sales total" value={currency(total)} /><MiniMetric label="Received" value={currency(received)} tone="green" /><MiniMetric label="Balance due" value={currency(Math.max(total - received, 0))} tone="orange" /><MiniMetric label="Transactions" value={filtered.length} tone="plum" /></div>
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input placeholder="Search sale, customer or item..." value={query} onChange={(event) => onQueryChange(event.target.value)} /></div></div>
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>DATE</th><th>DELIVERY DATE</th><th>SALE ID</th><th>CUSTOMER</th><th>ITEM / DESCRIPTION</th><th>AMOUNT</th><th>PAID</th><th>BALANCE</th><th>SOLD BY</th><th>ACTIONS</th></tr></thead>
      <tbody>{filtered.map((sale) => <tr key={sale.id}><td>{readableDate(sale.date)}</td><td>{readableDate(sale.deliveryDate)}</td><td className="strong-cell">{sale.id}</td><td><strong>{sale.customer}</strong><small className="sub-cell">{sale.phone || "—"}</small></td><td>{sale.itemDescription}</td><td>{currency(sale.amount)}</td><td>{currency(sale.paid)}</td><td>{currency(Math.max(Number(sale.amount) - Number(sale.paid), 0))}</td><td>{sale.createdBy || "—"}</td><td><div className="booking-admin-actions"><button className="icon-button" onClick={() => onEdit(sale)} aria-label={`Edit sale ${sale.id}`}><Pencil size={15} /></button><button className="icon-button booking-delete-button" onClick={() => onDelete(sale)} aria-label={`Delete sale ${sale.id}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody>
      </table>{filtered.length === 0 && <EmptyState title="No sales found" detail={query ? "Try another search or record a new sale." : "Your recorded sales will appear here."} />}</div></section>
  </>;
}

function RecentlyDeletedPage({ records, onRestore, onPermanentlyDelete }) {
  const activeRecords = records
    .filter((entry) => Date.parse(entry.expiresAt) > Date.now())
    .sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt));
  const describeRecord = (entry) => {
    const record = entry.record || {};
    if (entry.recordType === "article") return `${record.id} · ${record.name || "Article"}`;
    if (entry.recordType === "booking") return `${record.id} · ${record.customer || "Booking"}`;
    if (entry.recordType === "sale") return `${record.id} · ${record.customer || "Sale"}`;
    if (entry.recordType === "staff") return `${record.name || "Staff profile"} · ${record.title || "Salesperson"}`;
    return record.id || "Record";
  };
  return <>
    <PageHeader eyebrow="ADMINISTRATION" title="Recently deleted" description="Restore deleted records within three days or permanently remove them." />
    <section className="panel recently-deleted-panel">
      {activeRecords.length ? <div className="recently-deleted-list">{activeRecords.map((entry) => <article className="recently-deleted-item" key={entry.id}>
        <div className="recently-deleted-copy"><span className="recently-deleted-type">{entry.recordType}</span><strong>{describeRecord(entry)}</strong>
          <small><span>Deleted </span>{new Date(entry.deletedAt).toLocaleString()}<span> · Expires </span>{new Date(entry.expiresAt).toLocaleString()}</small></div>
        <div className="recently-deleted-actions"><Button variant="outline" icon={RotateCcw} onClick={() => onRestore(entry)}>Restore</Button>
          <Button variant="danger" icon={Trash2} onClick={() => onPermanentlyDelete(entry)}>Delete permanently</Button></div>
      </article>)}</div> : <EmptyState title="Nothing recently deleted" detail="Deleted articles, bookings, and sales will be kept here for three days." />}
    </section>
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

function PaymentsPage({ payments, bookings, query, onQueryChange, onAdd, isAdmin, currentUserId, currentUserName, salespeople, adminProfile }) {
  const [reportDate, setReportDate] = useState(today);
  const visibleBookings = isAdmin ? bookings : bookings.filter((booking) => booking.createdById
    ? booking.createdById === currentUserId
    : (booking.createdBy || booking.staff) === currentUserName);
  const visiblePayments = isAdmin ? payments : payments.filter((payment) => payment.receivedById
    ? payment.receivedById === currentUserId
    : payment.receivedBy === currentUserName);
  const due = visibleBookings.filter((item) => !["Returned", "Cancelled"].includes(item.status))
    .reduce((sum, item) => sum + Math.max(item.amount - item.paid, 0), 0);
  const total = visiblePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const filtered = visiblePayments.filter((item) => `${item.id} ${item.booking} ${item.customer} ${item.receivedBy}`.toLowerCase().includes(query.toLowerCase()));
  const staff = [{ id: "admin", name: adminProfile.name, role: "Administrator" },
    ...salespeople.map((person) => ({ id: person.id, name: person.name, role: "Salesperson" }))];
  const staffIds = new Set(staff.map((person) => person.id));
  const staffNames = new Set(staff.map((person) => person.name));
  const includeFormerStaff = (id, name) => {
    if (id && !staffIds.has(id)) {
      staff.push({ id, name: name || "Former staff", role: "Former staff" });
      staffIds.add(id);
      staffNames.add(name);
    } else if (!id && name && !staffNames.has(name)) {
      staff.push({ id: `legacy:${name}`, name, role: "Recorded staff" });
      staffNames.add(name);
    }
  };
  bookings.forEach((booking) => includeFormerStaff(booking.createdById, booking.createdBy || booking.staff));
  payments.forEach((payment) => includeFormerStaff(payment.receivedById, payment.receivedBy));
  const receivedByStaff = (payment, person) => payment.receivedById
    ? payment.receivedById === person.id
    : payment.receivedBy === person.name;
  const bookedByStaff = (booking, person) => booking.createdById
    ? booking.createdById === person.id
    : (booking.createdBy || booking.staff) === person.name;
  const dailyPayments = payments.filter((payment) => payment.date === reportDate);
  const dailyTotal = dailyPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const dailyBookings = bookings.filter((booking) => booking.bookingDate === reportDate);
  return <>
    <PageHeader eyebrow="FINANCE" title={isAdmin ? "Payments" : "Payments received"} description="Track every payment and the team member who collected it." action actionLabel="Record payment" onAction={onAdd} />
    <div className="finance-cards"><FinanceCard label="Total collected" value={currency(total)} note={isAdmin ? "All recorded receipts" : "Receipts collected by you"} icon={ArrowDownLeft} tone="green" /><FinanceCard label="Outstanding balance" value={currency(due)} note="Across your active bookings" icon={Clock3} tone="orange" /><FinanceCard label="Transactions" value={visiblePayments.length} note="Recorded receipts" icon={CreditCard} tone="plum" /></div>
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search by receipt, booking or customer..." /></div><Button variant="outline" icon={Download} onClick={() => window.print()}>Export statement</Button></div>
    <section className="panel table-panel"><div className="panel-heading table-title"><div><h2>Payment history</h2><p>Recent transactions and receipts</p></div><span className="subtle-count">{filtered.length} transactions</span></div>
      <div className="table-scroll"><table><thead><tr><th>RECEIPT</th><th>BOOKING</th><th>CUSTOMER</th><th>DATE</th><th>METHOD</th><th>RECEIVED BY</th><th>AMOUNT</th></tr></thead><tbody>
        {filtered.map((payment) => <tr key={payment.id}><td className="strong-cell">{payment.id}</td><td>{payment.booking}</td><td>{payment.customer}</td><td>{readableDate(payment.date)}</td><td><span className="payment-method"><CircleDollarSign size={15} />{payment.method}</span></td><td>{payment.receivedBy}</td><td className="money-cell">{currency(payment.amount)}</td></tr>)}
      </tbody></table>{filtered.length === 0 && <EmptyState title="No payments found" detail="Recorded payments will appear here." />}</div></section>
    <section className="panel due-panel"><div className="due-panel-icon"><AlertTriangle size={18} /></div><div><strong>Balances to follow up</strong><span>There are {visibleBookings.filter((b) => b.amount > b.paid && !["Returned", "Cancelled"].includes(b.status)).length} active bookings with remaining payments.</span></div><strong>{currency(due)}</strong></section>
    {isAdmin && <section className="panel staff-cash-panel"><div className="panel-heading table-title"><div><h2>Staff collection summary</h2><p>Compare lifetime activity with bookings and payments for the selected day.</p></div><label><span>Day-end date</span><DateInput ariaLabel="Staff summary date" value={reportDate} onChange={setReportDate} /></label></div>
      <div className="staff-cash-total"><span>Total received on {readableDate(reportDate)}</span><strong>{currency(dailyTotal)}</strong><small>{dailyPayments.length} payment{dailyPayments.length === 1 ? "" : "s"} · {dailyBookings.length} booking{dailyBookings.length === 1 ? "" : "s"} created</small></div>
      <div className="table-scroll"><table><thead><tr><th>TEAM MEMBER</th><th>ALL BOOKINGS</th><th>BOOKINGS THIS DAY</th><th>PAYMENTS THIS DAY</th><th>COLLECTED ALL TIME</th><th>COLLECTED THIS DAY</th></tr></thead><tbody>
        {staff.map((person) => {
          const memberBookings = bookings.filter((booking) => bookedByStaff(booking, person));
          const memberPayments = payments.filter((payment) => receivedByStaff(payment, person));
          const dayBookings = dailyBookings.filter((booking) => bookedByStaff(booking, person));
          const dayPayments = dailyPayments.filter((payment) => receivedByStaff(payment, person));
          const memberTotal = memberPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          const dayTotal = dayPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          return <tr key={person.id}><td><strong>{person.name}</strong><small className="sub-cell">{person.role}</small></td><td>{memberBookings.length}</td><td>{dayBookings.length}</td><td>{dayPayments.length}</td><td className="money-cell">{currency(memberTotal)}</td><td className="money-cell">{currency(dayTotal)}</td></tr>;
        })}
      </tbody></table></div>
    </section>}
  </>;
}

function FinanceCard({ label, value, note, icon: Icon, tone }) {
  return <article className="finance-card"><span className={`stat-icon icon-${tone}`}><Icon size={18} /></span><span className="finance-label">{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function ReturnsPage({ bookings, onReturn, onStatusChange, onRecordPayment }) {
  const active = bookings.filter((booking) => booking.status === "Out" || booking.status === "Confirmed");
  const out = active.filter((booking) => booking.status === "Out");
  return <>
    <PageHeader eyebrow="RENTAL OPERATIONS" title="Returns & tracking" description="Keep every rental on schedule, from delivery to return." />
    <div className="return-alert"><div className="alert-icon"><Clock3 size={20} /></div><div><strong>{out.length} items currently with customers</strong><span>Check expected return dates and prepare upcoming reservations.</span></div><button onClick={() => document.getElementById("returns-list")?.scrollIntoView({ behavior: "smooth" })}>View items <ChevronRight size={16} /></button></div>
    <div className="booking-stats"><MiniMetric label="Currently rented" value={out.length} tone="orange" /><MiniMetric label="Due today" value={out.filter((booking) => booking.returnDate === today).length} tone="plum" /><MiniMetric label="Upcoming deliveries" value={active.filter((booking) => booking.delivery >= today).length} tone="green" /><MiniMetric label="Overdue" value={out.filter((booking) => booking.returnDate < today).length} /></div>
    <section className="panel table-panel" id="returns-list"><div className="panel-heading table-title"><div><h2>Rental tracking</h2><p>Confirm returns as soon as the article is received and checked.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>ACTION</th><th>BOOKING</th><th>ARTICLE</th><th>CUSTOMER</th><th>DELIVERY DATE</th><th>EXPECTED RETURN</th><th>STATUS</th></tr></thead><tbody>
        {active.map((booking) => <tr key={booking.id}><td>{booking.status === "Out"
            ? <Button variant="small" icon={Check} onClick={() => onReturn(booking.id)}>Confirm return</Button>
            : booking.amount > booking.paid
              ? <Button variant="small" icon={Wallet} onClick={() => onRecordPayment(booking)}>Receive balance</Button>
              : <Button variant="small" icon={Truck} onClick={() => onStatusChange(booking, "Out")}>Mark picked up</Button>}</td><td className="strong-cell">{booking.id}</td><td><strong>{bookingArticleTitles(booking)}</strong><small className="sub-cell">{bookingArticleLabels(booking)}</small></td><td>{booking.customer}<small className="sub-cell">{booking.phone}</small></td><td>{readableDate(booking.delivery)}</td><td>{readableDate(booking.returnDate)}</td><td><Status>{booking.status === "Out" ? booking.returnDate < today ? "Overdue" : "With customer" : "Upcoming"}</Status></td></tr>)}
      </tbody></table></div></section>
    <div className="return-tip"><Sparkles size={17} /><span><strong>Return checklist:</strong> inspect the article condition, record any damage, and confirm any remaining payment before marking it available.</span></div>
  </>;
}

function TomorrowDeliveriesPage({ bookings, articles, dateRange, onRangeChange, onToggleReady }) {
  const deliveries = deliveryPrepBookings(bookings, articles, dateRange);
  const dressCount = deliveries.reduce((sum, booking) => sum + booking.deliveryArticles.length, 0);
  const readyCount = deliveries.reduce((sum, booking) => sum + booking.deliveryArticles.filter((article) => booking.prepReadyArticleIds?.includes(article.id)).length, 0);
  const printList = () => {
    const cleanup = () => document.body.classList.remove("printing-delivery-prep");
    document.body.classList.add("printing-delivery-prep");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  };
  const exportCsv = () => {
    const rows = [
      ["Booking", "Customer", "Phone", "Delivery date", "Article ID", "Article name", "Article photo", "Chest (in)", "Back (in)", "Hip (in)", "Special instructions", "Prep status"],
      ...deliveries.flatMap((booking) => booking.deliveryArticles.map((article) => [
        booking.id, booking.customer, booking.phone, booking.delivery, article.id, article.name, article.photo,
        booking.chest, booking.back, booking.hip, booking.notes,
        booking.prepReadyArticleIds?.includes(article.id) ? "Ready" : "Not ready",
      ])),
    ];
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value ?? "");
      const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `delivery-prep-${dateRange.from}-to-${dateRange.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="delivery-prep-page">
    <PageHeader eyebrow="RENTAL OPERATIONS" title="Delivery prep" description="Choose any upcoming delivery range and prepare every dress with its photo, measurements and instructions." />
    <div className="panel prep-range">
      <label><span>From date</span><DateInput ariaLabel="From date" min={today} value={dateRange.from} onChange={(from) => {
        onRangeChange({ from, to: dateRange.to < from ? from : dateRange.to });
      }} /></label>
      <label><span>To date</span><DateInput ariaLabel="To date" min={dateRange.from} value={dateRange.to} onChange={(to) => onRangeChange({ ...dateRange, to })} /></label>
      <span className="prep-range-hint">Choose any upcoming date range.</span>
    </div>
    <div className="prep-summary">
      <div><strong>{readableDate(dateRange.from)} – {readableDate(dateRange.to)}</strong><span>Delivery date range</span></div>
      <div><strong>{dressCount}</strong><span>Dresses to prepare</span></div>
      <div><strong>{deliveries.length}</strong><span>Bookings</span></div>
      <div><strong>{readyCount} / {dressCount}</strong><span>Ready dresses</span></div>
      <div className="prep-actions">
        <Button variant="outline" icon={Download} onClick={exportCsv}>Export CSV</Button>
        <Button variant="primary" icon={FileText} onClick={printList}>Print list</Button>
      </div>
    </div>
    {deliveries.length === 0
      ? <section className="panel"><EmptyState title="No deliveries in this date range" detail="Bookings scheduled in the selected date range will appear here, including their photos, measurements and instructions." /></section>
      : <div className="prep-list">{deliveries.map((booking) => <article className="panel prep-card" key={booking.id}>
        <div className="prep-booking-heading"><div><strong>{booking.customer}</strong><span>{booking.phone || "No phone number"} · {booking.id}</span></div><span className="prep-delivery-date">{readableDate(booking.delivery)}</span></div>
        <div className="prep-articles">{booking.deliveryArticles.map((article) => <div className="prep-article" key={article.id}>
          {article.photo ? <img src={article.photo} alt={article.name} /> : <span className="prep-image-placeholder"><Shirt size={20} /></span>}
          <div className="prep-article-copy"><strong>{article.name}</strong><span>{article.id}</span>
            <div className="prep-ready-actions"><Status>{booking.prepReadyArticleIds?.includes(article.id) ? "Ready" : "Not ready"}</Status>
              <button className="prep-ready-toggle" onClick={() => onToggleReady(booking.id, article.id)}>{booking.prepReadyArticleIds?.includes(article.id) ? "Mark not ready" : "Mark ready"}</button>
            </div>
          </div>
        </div>)}</div>
        <div className="prep-details">
          <div><small>Measurements (inches)</small><span>Chest: {booking.chest || "—"} · Back: {booking.back || "—"} · Hip: {booking.hip || "—"}</span></div>
          <div><small>Special instructions</small><span>{booking.notes || "No special instructions"}</span></div>
        </div>
      </article>)}</div>}
  </div>;
}

function CalendarPage({ bookings, articles, onNew, onView }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState("");
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dateString = (day) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayEvents = (day) => bookings.filter((booking) => booking.delivery === dateString(day) || booking.returnDate === dateString(day));
  return <>
    <PageHeader eyebrow="PLANNING" title="Calendar" description="See delivery dates and expected returns in one place." action actionLabel="Add booking" onAction={onNew} />
    <div className="calendar-layout"><section className="panel calendar-panel"><div className="calendar-toolbar"><div><h2>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><span>Rental schedule</span></div>
      <div className="calendar-arrows"><button className="button button-outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} />Previous</button><button className="button button-outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next<ChevronRight size={17} /></button></div></div>
      <div className="calendar-grid">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
        {Array.from({ length: offset }, (_, i) => <div className="calendar-day empty-day" key={`empty-${i}`} />)}
        {Array.from({ length: days }, (_, i) => { const day = i + 1; const events = dayEvents(day); return <div className={`calendar-day ${dateString(day) === today ? "current-day" : ""} ${selectedDate === dateString(day) ? "selected-calendar-day" : ""}`} key={day}><button type="button" className="day-number" onClick={() => setSelectedDate(dateString(day))} aria-label={`Show bookings for ${readableDate(dateString(day))}`}>{day}</button>
          {events.map((event) => <button type="button" className={`calendar-event event-${event.delivery === dateString(day) ? "delivery" : "return"}`} key={`${event.id}-${day}-${event.delivery === dateString(day) ? "delivery" : "return"}`} onClick={() => onView(event)} aria-label={`${event.delivery === dateString(day) ? "Delivery" : "Return"} details for ${event.customer} on ${readableDate(dateString(day))}`}>{event.delivery === dateString(day) ? "Delivery" : "Return"} · {event.customer.split(" ")[0]}</button>)}
        </div>; })}
      </div></section>
      {selectedDate && <section className="panel calendar-day-details"><div className="panel-heading"><div><h2>{readableDate(selectedDate)}</h2><p>Bookings with a delivery or expected return on this date</p></div><button className="icon-button" onClick={() => setSelectedDate("")} aria-label="Close date details"><X size={17} /></button></div>
        {bookings.filter((booking) => booking.delivery === selectedDate || booking.returnDate === selectedDate).length
          ? bookings.filter((booking) => booking.delivery === selectedDate || booking.returnDate === selectedDate).map((booking) => <article className="calendar-detail-row" key={booking.id}>
            {bookingArticleRecords(booking, articles).find((article) => article.photo)?.photo && <img src={bookingArticleRecords(booking, articles).find((article) => article.photo).photo} alt="" />}
            <div><strong>{booking.customer} · {booking.id}</strong><span>{bookingArticleTitles(booking) || "No articles selected"}</span><small>{booking.delivery === selectedDate ? "Delivery" : ""}{booking.delivery === selectedDate && booking.returnDate === selectedDate ? " · " : ""}{booking.returnDate === selectedDate ? "Expected return" : ""} · {booking.phone} · {currency(booking.amount)} · {booking.status}</small></div>
            <Button variant="outline" icon={Eye} onClick={() => onView(booking)}>View bill</Button>
          </article>)
          : <p className="calendar-no-bookings">No booking events on this date.</p>}
      </section>}
      <aside className="panel calendar-side"><div className="panel-heading"><div><h2>Upcoming</h2><p>Next in your schedule</p></div></div>
        <div className="calendar-legend"><span><i className="legend-delivery" />Delivery</span><span><i className="legend-return" />Expected return</span></div>
        {bookings.filter((b) => b.status !== "Returned").slice(0, 4).map((booking) => <div className="upcoming-item" key={booking.id}><div className="upcoming-date"><strong>{new Date(`${booking.delivery}T00:00:00`).getDate()}</strong><span>{new Date(`${booking.delivery}T00:00:00`).toLocaleDateString("en", { month: "short" })}</span></div><div><strong>{booking.customer}</strong><span>{bookingArticleTitles(booking)}</span><small>Delivery · {readableDate(booking.delivery)}</small></div></div>)}
      </aside></div>
  </>;
}

function ReportsPage({ bookings, payments, articles }) {
  const revenue = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const averageRental = bookings.length
    ? bookings.reduce((sum, booking) => sum + Number(booking.amount || 0), 0) / bookings.length
    : 0;
  const categoryCounts = new Map();
  const articleCategories = new Map(articles.map((article) => [article.id, article.category || "Other"]));
  bookings.forEach((booking) => bookingArticleIds(booking).forEach((id) => {
    const category = articleCategories.get(id);
    if (category) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }));
  const categories = [...categoryCounts].sort((left, right) => right[1] - left[1]);
  const topCategory = categories[0];
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: date.toLocaleDateString("en", { month: "short" }),
      count: bookings.filter((booking) => String(booking.bookingDate || "").startsWith(key)).length,
    };
  });
  const highestMonthCount = Math.max(...monthBuckets.map(({ count }) => count));
  return <>
    <PageHeader eyebrow="BUSINESS INSIGHTS" title="Reports" description="Understand your rental performance and make informed decisions." action actionLabel="Download report" actionIcon={Download} onAction={() => window.print()} />
    <div className="report-period"><span>Showing performance for</span><select defaultValue="This month"><option>This month</option><option>This week</option><option>This year</option><option>Custom range</option></select><button className="button button-outline" onClick={() => window.print()}><Download size={15} /> Export PDF</button></div>
    <div className="stats-grid report-stats"><StatCard label="Rental revenue" value={currency(revenue)} note="Collected payments" icon={Wallet} tone="green" /><StatCard label="Bookings created" value={bookings.length} note="All recorded bookings" icon={CalendarDays} tone="plum" /><StatCard label="Average rental" value={currency(averageRental)} note="Per recorded booking" icon={CircleDollarSign} tone="blue" /><StatCard label="Top category" value={topCategory?.[0] || "—"} note={topCategory ? `${topCategory[1]} recorded rentals` : "No category data yet"} icon={Shirt} tone="orange" /></div>
    <div className="dashboard-grid"><section className="panel report-panel"><div className="panel-heading"><div><h2>Bookings by month</h2><p>Confirmed rentals over the past 6 months</p></div></div>
      <div className="report-chart">{monthBuckets.map(({ key, label, count }) => <div className="report-bar-column" key={key}><strong>{count}</strong><div className="report-bar" style={{ height: `${highestMonthCount ? Math.max((count / highestMonthCount) * 100, 4) : 4}%` }} /><span>{label}</span></div>)}</div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Popular categories</h2><p>Share of all rentals</p></div></div><div className="category-report">
        {categories.length
          ? categories.map(([label, count], index) => {
            const percent = Math.round((count / categories.reduce((sum, [, total]) => sum + total, 0)) * 100);
            const color = ["plum", "orange", "blue"][index % 3];
            return <div className="category-row" key={label}><div><span>{label}</span><strong>{percent}%</strong></div><div className="progress-track"><span className={`progress-${color}`} style={{ width: `${percent}%` }} /></div></div>;
          })
          : <EmptyState title="No category data yet" detail="Categories from your bookings will appear here." />}
      </div></section></div>
    <div className="report-shortcuts"><ReportShortcut icon={FileText} title="Booking report" detail="All rentals by date and status" /><ReportShortcut icon={Wallet} title="Pending payments" detail="Balances that need follow-up" /><ReportShortcut icon={RotateCcw} title="Return history" detail="Returned and overdue articles" /><ReportShortcut icon={Users} title="Staff performance" detail="Bookings by team member" /></div>
  </>;
}

function ReportShortcut({ icon: Icon, title, detail }) {
  return <button className="report-shortcut" onClick={() => window.print()}><span><Icon size={18} /></span><strong>{title}</strong><small>{detail}</small><ChevronRight size={16} /></button>;
}

function ApprovalsPage({ requests, error, onReview }) {
  const pending = requests.filter((request) => request.status === "Pending");
  const history = requests.filter((request) => request.status !== "Pending");
  const summary = (request) => {
    const record = request.currentRecord || {};
    const label = request.entityType === "booking"
      ? `${record.id || request.recordId} · ${record.customer || "Customer"}`
      : request.entityType === "article"
        ? `${record.id || request.recordId} · ${record.name || "Article"}`
        : `${record.id || request.recordId} · ${record.customer || "Sale"}`;
    return request.action === "delete"
      ? `Delete ${label}`
      : `Edit ${label}`;
  };
  const requestCard = (request) => <article className="panel approval-card" key={request.id}>
    <div><div className="approval-card-title"><strong>{summary(request)}</strong><Status>{request.status}</Status></div>
      <p>Requested by {request.requestedBy || "Salesperson"} · {new Date(request.requestedAt).toLocaleString()}</p>
      {request.action === "edit" && request.proposedRecord && <small>{request.entityType === "booking"
        ? `Delivery ${readableDate(request.proposedRecord.delivery)} · Return ${readableDate(request.proposedRecord.returnDate)} · ${currency(request.proposedRecord.amount)}`
        : request.entityType === "article"
          ? `${request.proposedRecord.category} · ${currency(request.proposedRecord.price)} rental`
          : `${request.proposedRecord.itemDescription} · ${currency(request.proposedRecord.amount)}`}</small>}
    </div>
    {request.status === "Pending" && <div className="approval-actions">
      <Button variant="outline" icon={XCircle} onClick={() => onReview(request, "Rejected")}>Reject</Button>
      <Button icon={CheckCircle2} onClick={() => onReview(request, "Approved")}>Approve</Button>
    </div>}
  </article>;
  return <>
    <PageHeader eyebrow="MANAGEMENT" title="Approvals" description="Review booking, article, and sale changes requested by your team." />
    {error && <p className="approval-error" role="alert">{error}</p>}
    <section className="approval-section"><div className="panel-heading"><div><h2>Pending requests</h2><p>{pending.length} waiting for review</p></div></div>
      {pending.length ? pending.map(requestCard) : <section className="panel"><EmptyState title="No pending requests" detail="Team change requests will appear here for review." /></section>}
    </section>
    {!!history.length && <section className="approval-section"><div className="panel-heading"><div><h2>Recent decisions</h2><p>Previously reviewed requests</p></div></div>{history.slice(0, 10).map(requestCard)}</section>}
  </>;
}

function StaffPage({ salespeople, onAdd, onEdit, onToggle, onDelete, onChangeAdminPin }) {
  const activeCount = salespeople.filter((person) => person.active !== false).length;
  return <>
    <PageHeader eyebrow="TEAM ACCESS" title="Staff & roles" description="Create up to six salesperson profiles and assign each person their own PIN." action actionLabel="Add salesperson" onAction={onAdd} />
    <div className="role-banner"><ShieldCheck size={21} /><div><strong>Administrator PIN protection</strong><span>Only an administrator can create or manage salesperson profiles.</span></div><button className="button button-outline" onClick={onChangeAdminPin}>Change admin PIN</button></div>
    <div className="staff-capacity"><div><Users size={18} /><strong>{activeCount} of 6</strong><span>active salesperson profiles</span></div><div className="staff-slots">{Array.from({ length: 6 }, (_, index) => <span className={index < activeCount ? "staff-slot-filled" : ""} key={index} />)}</div></div>
    <section className="panel table-panel"><div className="panel-heading table-title"><div><h2>Salesperson profiles</h2><p>PIN verification and profile access are managed by the backend.</p></div></div>
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
    } catch (saveError) {
      setError(saveError.message || "Could not save this profile. Please try again.");
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

function SettingsPage({ language, onLanguageChange, business, onSaveBusiness, notifications, onNotificationsChange, onChangeAdminPin, onManageStaff, onNotify }) {
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState("business");
  const [draft, setDraft] = useState({ ...defaultBusinessSettings, ...business });
  useEffect(() => setDraft({ ...defaultBusinessSettings, ...business }), [business]);
  const updateDraft = (key) => (event) => setDraft({ ...draft, [key]: event.target.value });
  const saveDraft = () => {
    onSaveBusiness(draft);
    setSaved(true);
    onNotify("Settings saved successfully.");
  };
  const sections = [
    { id: "business", label: "Business profile", icon: Settings },
    { id: "security", label: "Security & access", icon: ShieldCheck },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "receipt", label: "Receipt details", icon: FileText },
  ];
  return <>
    <PageHeader eyebrow="PREFERENCES" title="Boutique settings" description="Configure business details and defaults for your workspace." />
    <div className="settings-layout"><nav className="settings-nav">{sections.map(({ id, label, icon: Icon }) => <button key={id} className={activeSection === id ? "settings-active" : ""} onClick={() => setActiveSection(id)}><Icon size={16} />{label}</button>)}</nav>
      <section className="panel settings-panel">
        {activeSection === "business" && <><div className="panel-heading"><div><h2>Business profile</h2><p>Configure your boutique and workspace language.</p></div></div>
          <div className="settings-language"><Field label="Language"><select value={language} onChange={(event) => onLanguageChange(event.target.value)}><option value="en">English</option><option value="ur">Urdu</option></select></Field><p>English is the default language. Choose Urdu to switch the interface.</p></div>
          <div className="settings-fields"><Field label="Boutique name"><input value={draft.name} onChange={updateDraft("name")} required /></Field><Field label="Contact phone"><input value={draft.phone} onChange={updateDraft("phone")} /></Field><Field label="Email address"><input type="email" value={draft.email} onChange={updateDraft("email")} /></Field><Field label="Boutique address" className="field-full"><textarea rows="3" value={draft.address} onChange={updateDraft("address")} /></Field></div>
          <div className="settings-save"><span>{saved ? "Saved locally. Cloud sync status appears in the footer." : "Changes sync with the cloud."}</span><Button onClick={saveDraft} icon={Check}>Save changes</Button></div></>}
        {activeSection === "security" && <><div className="panel-heading"><div><h2>Security & access</h2><p>Manage sign-in protection for your boutique workspace.</p></div></div>
          <div className="settings-security-card"><span className="role-option-icon admin-icon"><LockKeyhole size={18} /></span><div><strong>Administrator PIN</strong><p>Your administrator profile is protected with a PIN. Salespeople use their individual PINs.</p></div><Status>Protected</Status></div>
          <div className="settings-security-actions"><Button variant="outline" icon={ShieldCheck} onClick={onChangeAdminPin}>Change administrator PIN</Button><Button variant="outline" icon={Users} onClick={onManageStaff}>Manage salesperson access</Button></div></>}
        {activeSection === "notifications" && <>
          <div className="panel-heading"><div><h2>Notifications</h2><p>Choose which in-app alerts appear in the notification menu.</p></div></div>
          <div className="notification-settings-intro"><span><Bell size={18} /></span><div><strong>Stay up to date</strong><small>Your choices are saved automatically and apply to the notification menu.</small></div>          <b>{Object.values(notifications).filter(Boolean).length} <span>enabled</span></b></div>
          <div className="settings-toggle-list">{[
            ["bookings", "Booking updates", "New and updated booking alerts", CalendarDays],
            ["payments", "Payment reminders", "Outstanding balance and payment alerts", Wallet],
            ["returns", "Return reminders", "Upcoming and overdue return alerts", RotateCcw],
          ].map(([key, title, description, Icon]) => <label className={`settings-toggle${notifications[key] ? " settings-toggle-on" : ""}`} key={key}>
            <span className="settings-toggle-icon"><Icon size={18} /></span>
            <span className="settings-toggle-copy"><strong>{title}</strong><small>{description}</small></span>
            <input type="checkbox" aria-label={`${notifications[key] ? "Turn off" : "Turn on"} ${title}`} checked={Boolean(notifications[key])} onChange={(event) => onNotificationsChange({ ...notifications, [key]: event.target.checked })} />
          </label>)}</div>
        </>}
        {activeSection === "receipt" && <><div className="panel-heading"><div><h2>Receipt details</h2><p>These business details appear on printed booking receipts.</p></div></div>
          <div className="settings-fields"><Field label="Receipt business name"><input value={draft.name} onChange={updateDraft("name")} required /></Field><Field label="Contact phone"><input value={draft.phone} onChange={updateDraft("phone")} /></Field><Field label="Business address" className="field-full"><textarea rows="2" value={draft.address} onChange={updateDraft("address")} /></Field><Field label="Receipt footer message" className="field-full"><textarea rows="2" value={draft.receiptFooter} onChange={updateDraft("receiptFooter")} /></Field></div>
          <div className="settings-save"><span>{saved ? "Saved locally. Cloud sync status appears in the footer." : "Receipt details sync with the cloud."}</span><Button onClick={saveDraft} icon={Check}>Save receipt details</Button></div></>}
      </section></div>
  </>;
}

function ProfilePage({ profile, role, onEdit }) {
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <>
    <PageHeader eyebrow="YOUR ACCOUNT" title="My profile" description="Review and update your account information." />
    <section className="profile-hero panel"><div className="profile-avatar">{initials}</div><div className="profile-person"><h2>{profile.name}</h2><span>{profile.email}</span><span className={`role-pill role-${role === "admin" ? "admin" : "sales"}`}>{role === "admin" ? <ShieldCheck size={13} /> : <UserRound size={13} />}{role === "admin" ? "Administrator" : "Salesperson"}</span></div><button className="button button-outline" onClick={onEdit}><Pencil size={15} />Edit profile</button></section>
    <div className="profile-grid"><section className="panel profile-section"><div className="panel-heading"><div><h2>Account details</h2><p>Your personal and contact information</p></div><button className="text-button" onClick={onEdit}><Pencil size={13} /> Edit</button></div><div className="profile-detail"><span>Full name</span><strong>{profile.name}</strong></div><div className="profile-detail"><span>Email address</span><strong>{profile.email || "—"}</strong></div><div className="profile-detail"><span>Phone number</span><strong>{profile.phone || "—"}</strong></div><div className="profile-detail"><span>Role</span><strong>{role === "admin" ? "Administrator" : "Salesperson"}</strong></div><div className="profile-detail"><span>Member since</span><strong>{profile.createdAt ? readableDate(String(profile.createdAt).slice(0, 10)) : "—"}</strong></div></section>
      <section className="panel profile-section"><div className="panel-heading"><div><h2>Profile security</h2><p>Each team member signs in with an individual PIN.</p></div></div><div className="security-profile-info"><span className="role-option-icon admin-icon"><LockKeyhole size={18} /></span><div><strong>PIN-protected profile</strong><small>{role === "admin" ? "You can update the administrator PIN under Staff & roles." : "Ask your administrator to reset your salesperson PIN."}</small></div></div><p className="demo-notice">PIN verification and access sessions are handled by the backend.</p></section></div>
  </>;
}

function ProfileEditForm({ profile, onSave, onCancel }) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const updated = { name: name.trim(), email: email.trim(), phone: phone.trim() };
    if (!updated.name || !updated.email || !updated.phone) {
      setError("Please complete all profile fields.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(updated);
    } catch (saveError) {
      setError(saveError.message || "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return <form className="form-grid" onSubmit={submit}>
    <Field label="Full name *" className="field-full"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} required /></Field>
    <Field label="Email address *" className="field-full"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
    <Field label="Phone number *" className="field-full"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></Field>
    {error && <p className="form-error field-full" role="alert">{error}</p>}
    <div className="modal-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={Check} disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button></div>
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
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [adminConfigured, setAdminConfigured] = useState(false);
  const [profile, setProfile] = useState(emptyProfile);
  const [salespeople, setSalespeople] = useState([]);
  const [articles, setArticles] = useSyncedData("articles", seedArticles, Boolean(session));
  const [customers, setCustomers] = useSyncedData("customers", seedCustomers, Boolean(session));
  const [bookings, setBookings] = useSyncedData("bookings", seedBookings, Boolean(session));
  const [payments, setPayments] = useSyncedData("payments", seedPayments, Boolean(session));
  const [sales, setSales] = useSyncedData("sales", [], Boolean(session));
  const [deletedRecords, setDeletedRecords] = useSyncedData("deletedRecords", [], session?.role === "admin");
  const [workspaceSettings, setWorkspaceSettings] = useSyncedData("settings", [], Boolean(session));
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [approvalError, setApprovalError] = useState("");
  const businessSettings = workspaceSettings.find((item) => item.id === "business")?.value || defaultBusinessSettings;
  const notificationSettings = workspaceSettings.find((item) => item.id === "notifications")?.value || defaultNotificationSettings;
  const language = workspaceSettings.find((item) => item.id === "language")?.value || "en";
  const updateSetting = (id, value) => setWorkspaceSettings((current) => {
    const item = current.find((entry) => entry.id === id);
    return item
      ? current.map((entry) => entry.id === id ? { ...entry, value } : entry)
      : [...current, { id, value }];
  });
  const setBusinessSettings = (value) => updateSetting("business", value);
  const setNotificationSettings = (value) => updateSetting("notifications", value);
  const setLanguage = (value) => updateSetting("language", value);
  useEffect(() => {
    const handleSyncStatus = (event) => {
      setSyncStatus(event.detail.status);
      setSyncError(event.detail.error || "");
    };
    window.addEventListener("drb-sync-status", handleSyncStatus);
    return () => window.removeEventListener("drb-sync-status", handleSyncStatus);
  }, []);
  useEffect(() => {
    let active = true;
    const initializeAuth = async () => {
      try {
        const profiles = await loadAuthProfiles();
        const restoredSession = await restoreSession().catch((error) => {
          if (error.status === 401) return null;
          throw error;
        });
        if (!active) return;
        setAdminConfigured(profiles.adminConfigured);
        setProfile(restoredSession?.role === "admin" ? restoredSession : profiles.admin || emptyProfile);
        const availableSalespeople = profiles.salespeople || [];
        setSalespeople(restoredSession?.role === "sales"
          ? availableSalespeople.map((person) => person.id === restoredSession.id ? restoredSession : person)
          : availableSalespeople);
        setSession(restoredSession);
        setAuthError("");
        if (restoredSession?.role === "admin") {
          try {
            const managedProfiles = await loadManagedProfiles();
            if (active) {
              setProfile(managedProfiles.admin);
              setSalespeople(managedProfiles.salespeople);
            }
          } catch (error) {
            if (active) setAuthError(error.message);
          }
        }
      } catch (error) {
        if (active) setAuthError(error.message);
      } finally {
        if (active) setAuthReady(true);
      }
    };
    initializeAuth();
    return () => { active = false; };
  }, []);
  const [activePage, setActivePage] = useState("dashboard");
  const [prepDateRange, setPrepDateRange] = useState(() => ({ from: today, to: dateAfter(today, 1) }));
  const [bootStage, setBootStage] = useState("splash");
  const [pullRefresh, setPullRefresh] = useState({ distance: 0, active: false });
  const pullRefreshRef = useRef({ startY: 0, distance: 0, pulling: false });
  const isRefreshingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [modal, setModalState] = useState(null);
  const activePageRef = useRef(activePage);
  const modalRef = useRef(modal);
  const modalHistoryRef = useRef(new Map());
  const activeModalHistoryIdRef = useRef(null);
  const modalHistoryCounterRef = useRef(0);
  activePageRef.current = activePage;
  modalRef.current = modal;
  const setModal = (next, { replace = false } = {}) => {
    const resolved = typeof next === "function" ? next(modalRef.current) : next;
    if (!resolved) {
      if (modalRef.current?.type === "booking") {
        setBookingDraft(null);
        setBookingFormError("");
      }
      if (modalRef.current && window.history.state?.drbApp && window.history.state.modalId) {
        window.history.back();
      } else {
        if (activeModalHistoryIdRef.current) modalHistoryRef.current.delete(activeModalHistoryIdRef.current);
        activeModalHistoryIdRef.current = null;
        setModalState(null);
      }
      return;
    }
    const modalId = `modal-${++modalHistoryCounterRef.current}`;
    modalHistoryRef.current.set(modalId, resolved);
    activeModalHistoryIdRef.current = modalId;
    const state = { drbApp: true, page: activePageRef.current, modalId };
    if (replace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setModalState(resolved);
  };
  const [quickCreatedArticleId, setQuickCreatedArticleId] = useState("");
  const [bookingDraft, setBookingDraft] = useState(null);
  const [bookingFormError, setBookingFormError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    if (!session) return undefined;
    modalHistoryRef.current.clear();
    activeModalHistoryIdRef.current = null;
    const appState = { drbApp: true, page: activePageRef.current, modalId: null };
    window.history.replaceState(appState, "");
    const handlePopState = (event) => {
      const state = event.state;
      if (state?.drbApp) {
        if (modalRef.current?.type === "booking" && !state.modalId) setBookingDraft(null);
        if (activeModalHistoryIdRef.current && activeModalHistoryIdRef.current !== state.modalId) {
          modalHistoryRef.current.delete(activeModalHistoryIdRef.current);
        }
        activeModalHistoryIdRef.current = state.modalId || null;
        if (state.page !== activePageRef.current) setQuery("");
        activePageRef.current = state.page || "dashboard";
        setActivePage(state.page || "dashboard");
        setModalState(state.modalId ? modalHistoryRef.current.get(state.modalId) || null : null);
        setMobileNav(false);
        return;
      }
      if (activeModalHistoryIdRef.current) modalHistoryRef.current.delete(activeModalHistoryIdRef.current);
      activeModalHistoryIdRef.current = null;
      setModalState(null);
      setMobileNav(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [session]);
  useEffect(() => {
    const timer = window.setTimeout(() => setBootStage("access"), 700);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (modal?.type !== "booking-detail") return undefined;
    document.body.classList.add("printing-receipt");
    return () => document.body.classList.remove("printing-receipt");
  }, [modal?.type]);
  useEffect(() => {
    if (!modal && !mobileNav) return undefined;
    const scrollY = window.scrollY;
    const body = document.body;
    const previousStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      Object.assign(body.style, previousStyles);
      window.scrollTo(0, scrollY);
    };
  }, [Boolean(modal), mobileNav]);
  useEffect(() => {
    const root = document.documentElement;
    const content = document.getElementById("root");
    const isUrdu = language === "ur";
    root.lang = isUrdu ? "ur" : "en";
    root.dir = isUrdu ? "rtl" : "ltr";
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
  }, [language]);
  const notify = (message) => {
    setToast(translateText(message, language));
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2500);
  };
  useEffect(() => {
    if (!session) {
      setApprovalRequests([]);
      setApprovalError("");
      return undefined;
    }
    let active = true;
    const synchronizeApprovals = () => loadApprovalRequests()
      .then((items) => {
        if (!active) return;
        setApprovalRequests(items);
        setApprovalError("");
      })
      .catch((error) => {
        if (active) setApprovalError(error.message || "Could not load approval requests.");
      });
    synchronizeApprovals();
    window.addEventListener("focus", synchronizeApprovals);
    const interval = window.setInterval(synchronizeApprovals, 30000);
    return () => {
      active = false;
      window.removeEventListener("focus", synchronizeApprovals);
      window.clearInterval(interval);
    };
  }, [session]);
  const requestApproval = async (requestDetails, successMessage) => {
    try {
      const { item } = await createApprovalRequest(requestDetails);
      setApprovalRequests((current) => [item, ...current]);
      setModal(null);
      notify(successMessage);
    } catch (error) {
      notify(error.message || "Could not send this change for approval.");
    }
  };
  const decideApproval = async (approval, decision) => {
    try {
      const deletedRecord = decision === "Approved" && approval.action === "delete"
        ? approval.entityType === "article" ? articles.find((item) => item.id === approval.recordId)
          : approval.entityType === "booking" ? bookings.find((item) => item.id === approval.recordId)
            : approval.entityType === "sale" ? sales.find((item) => item.id === approval.recordId)
              : null
        : null;
      const deletedPayments = approval.entityType === "booking" && deletedRecord
        ? payments.filter((payment) => payment.booking === deletedRecord.id)
        : [];
      await reviewApprovalRequest(approval.id, decision);
      if (deletedRecord) moveToRecentlyDeleted(approval.entityType, deletedRecord, { payments: deletedPayments });
      const items = await loadApprovalRequests();
      setApprovalRequests(items);
      notify(decision === "Approved" ? "Change approved and applied." : "Change request rejected.");
      if (approval.entityType === "booking") {
        const [updatedBookings, updatedArticles, updatedCustomers, updatedPayments] = await Promise.all([
          refreshCollection("bookings"), refreshCollection("articles"), refreshCollection("customers"), refreshCollection("payments"),
        ]);
        setBookings(updatedBookings);
        setArticles(updatedArticles);
        setCustomers(updatedCustomers);
        setPayments(updatedPayments);
      } else if (approval.entityType === "article") {
        setArticles(await refreshCollection("articles"));
        setBookings(await refreshCollection("bookings"));
      } else if (approval.entityType === "sale") {
        setSales(await refreshCollection("sales"));
      }
    } catch (error) {
      notify(error.message || "Could not process this approval.");
    }
  };
  const refreshAllDataRef = useRef(null);
  refreshAllDataRef.current = async () => {
    const collections = [
      ["articles", setArticles],
      ["bookings", setBookings],
      ["customers", setCustomers],
      ["payments", setPayments],
      ["sales", setSales],
      ["settings", setWorkspaceSettings],
    ];
    if (session?.role === "admin") collections.push(["deletedRecords", setDeletedRecords]);
    const results = await Promise.allSettled(collections.map(async ([collection, setCollection]) => {
      const items = await refreshCollection(collection);
      setCollection(items);
      return collection;
    }));
    const errors = results.flatMap((result, index) => result.status === "rejected"
      ? [`${collections[index][0]}: ${result.reason instanceof Error ? result.reason.message : "Refresh failed"}`]
      : []);
    if (errors.length) notify(`Cloud refresh failed. ${errors.join(" · ")}`);
    else notify("Cloud data refreshed.");
  };
  useEffect(() => {
    if (!session) return undefined;
    const resetPull = () => {
      pullRefreshRef.current.pulling = false;
      pullRefreshRef.current.distance = 0;
      setPullRefresh({ distance: 0, active: false });
    };
    const onTouchStart = (event) => {
      if (event.touches.length !== 1 || isRefreshingRef.current || modalRef.current || window.scrollY > 0 || document.scrollingElement?.scrollTop > 0) return;
      if (event.target.closest?.("input, textarea, select, button, a, [role='dialog']")) return;
      pullRefreshRef.current = { startY: event.touches[0].clientY, distance: 0, pulling: true };
    };
    const onTouchMove = (event) => {
      const pull = pullRefreshRef.current;
      if (!pull.pulling || event.touches.length !== 1) return;
      const delta = event.touches[0].clientY - pull.startY;
      if (delta <= 0) {
        resetPull();
        return;
      }
      if (window.scrollY > 0 || document.scrollingElement?.scrollTop > 0) {
        resetPull();
        return;
      }
      event.preventDefault();
      pull.distance = Math.min(delta * 0.55, 96);
      setPullRefresh({ distance: pull.distance, active: false });
    };
    const onTouchEnd = () => {
      const shouldRefresh = pullRefreshRef.current.pulling && pullRefreshRef.current.distance >= 68;
      pullRefreshRef.current.pulling = false;
      if (!shouldRefresh) {
        resetPull();
        return;
      }
      pullRefreshRef.current.distance = 72;
      isRefreshingRef.current = true;
      setPullRefresh({ distance: 72, active: true });
      refreshAllDataRef.current()
        .finally(() => {
          isRefreshingRef.current = false;
          resetPull();
        });
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", resetPull, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
      resetPull();
    };
  }, [session]);
  const configuredNotifications = { ...defaultNotificationSettings, ...notificationSettings };
  const role = session?.role || "admin";
  const activeSalesperson = session?.role === "sales" ? salespeople.find((person) => person.id === session.id) : null;
  const currentProfile = session?.role === "sales" ? activeSalesperson || profile : profile;
  const currentUserId = role === "admin" ? "admin" : session.id;
  const pageTitles = {
    dashboard: "Dashboard", articles: "Articles", bookings: "Bookings", sales: "Sales", customers: "Customers",
    "recently-deleted": "Recently deleted",
    "jewellery-bookings": "Jewellery Set Booking",
    payments: role === "admin" ? "Payments" : "Payments received", returns: "Returns & tracking", tomorrow: "Delivery prep", calendar: "Calendar", reports: "Reports", approvals: "Approvals",
    staff: "Staff & roles", settings: "Settings", profile: "My profile",
  };
  const visibleGroups = navGroups
    .filter((group) => !group.adminOnly || role === "admin")
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        label: role === "sales" && item.id === "payments" ? "Payments received"
            : item.label,
      })),
    }));
  const returnAlerts = bookings.filter((booking) => booking.status === "Out" && booking.returnDate <= today);
  const paymentAlerts = bookings.filter((booking) => !["Returned", "Cancelled"].includes(booking.status) && booking.amount > booking.paid);
  const bookingAlerts = bookings.filter((booking) => booking.delivery === today && booking.status === "Confirmed");
  const hasNotifications = (configuredNotifications.returns && returnAlerts.length)
    || (configuredNotifications.payments && paymentAlerts.length)
    || (configuredNotifications.bookings && bookingAlerts.length);
  const nav = (page) => {
    if (page === "new-booking") {
      setBookingDraft(null);
      setModal({ type: "booking" });
    }
    else {
      const nextPage = page === "today-deliveries" ? "tomorrow" : page;
      if (page === "today-deliveries") {
        setPrepDateRange({ from: today, to: today });
      } else {
        if (page === "tomorrow") setPrepDateRange({ from: today, to: dateAfter(today, 1) });
      }
      if (nextPage !== activePageRef.current) {
        window.history.pushState({ drbApp: true, page: nextPage, modalId: null }, "");
        activePageRef.current = nextPage;
        setActivePage(nextPage);
      }
      setQuery("");
    }
    setMobileNav(false);
  };
  const togglePrepReady = (bookingId, articleId) => {
    setBookings((current) => current.map((booking) => {
      if (booking.id !== bookingId) return booking;
      const readyIds = new Set(booking.prepReadyArticleIds || []);
      if (readyIds.has(articleId)) readyIds.delete(articleId);
      else readyIds.add(articleId);
      return { ...booking, prepReadyArticleIds: [...readyIds] };
    }));
  };
  const handleAdminSetup = async ({ name, pin, setupToken }) => {
    const newSession = await setupAdmin({ name, pin, setupToken });
    setAdminConfigured(true);
    setProfile(newSession);
    setSession(newSession);
    setAuthError("");
    setActivePage("dashboard");
  };
  const moveToRecentlyDeleted = (recordType, record, relatedRecords = {}) => {
    const deletedAt = new Date();
    setDeletedRecords((current) => [{
      id: createRecordId("DEL"),
      recordType,
      record,
      relatedRecords,
      deletedAt: deletedAt.toISOString(),
      expiresAt: new Date(deletedAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }, ...current]);
  };
  const handleDeletedRecordRestore = async (entry) => {
    if (Date.parse(entry.expiresAt) <= Date.now()) {
      setDeletedRecords((current) => current.filter((item) => item.id !== entry.id));
      notify("This record has expired and can no longer be restored.");
      return;
    }
    const record = entry.record;
    if (entry.recordType === "staff") {
      try {
        const restoredProfile = await restoreStaff(record.id);
        setSalespeople((current) => [restoredProfile, ...current.filter((person) => person.id !== restoredProfile.id)]);
        setDeletedRecords((current) => current.filter((item) => item.id !== entry.id));
        notify(`${record.name} restored successfully.`);
      } catch (error) {
        notify(error.message || "Could not restore this salesperson profile.");
      }
      return;
    }
    if (entry.recordType === "article") {
      if (articles.some((item) => item.id === record.id)) {
        notify(`Cannot restore ${record.id}: an article with that number already exists.`);
        return;
      }
      setArticles((current) => [record, ...current]);
    } else if (entry.recordType === "sale") {
      if (sales.some((item) => item.id === record.id)) {
        notify(`Cannot restore ${record.id}: a sale with that ID already exists.`);
        return;
      }
      setSales((current) => [record, ...current]);
    } else if (entry.recordType === "booking") {
      if (bookings.some((item) => item.id === record.id)) {
        notify(`Cannot restore ${record.id}: a booking with that ID already exists.`);
        return;
      }
      const restoredPayments = entry.relatedRecords?.payments || [];
      if (restoredPayments.some((payment) => payments.some((item) => item.id === payment.id))) {
        notify(`Cannot restore ${record.id}: one of its payment IDs is already in use.`);
        return;
      }
      const updatedBookings = [record, ...bookings];
      setBookings(updatedBookings);
      setPayments((current) => [...restoredPayments, ...current]);
      setArticles((current) => current.map((article) => article.status === "Maintenance"
        ? article
        : {
          ...article,
          status: updatedBookings.some((booking) => bookingArticleIds(booking).includes(article.id)
            && !["Returned", "Cancelled"].includes(booking.status)) ? "Booked" : "Available",
        }));
    }
    setDeletedRecords((current) => current.filter((item) => item.id !== entry.id));
    notify(`${record.id} restored successfully.`);
  };
  const handleDeletedRecordPurge = async (entry) => {
    if (!window.confirm(`Permanently delete ${entry.record?.id || "this record"}? This cannot be undone.`)) return;
    try {
      if (entry.recordType === "staff") {
        await permanentlyDeleteStaff(entry.record.id);
        setSalespeople((current) => current.filter((person) => person.id !== entry.record.id));
      }
      setDeletedRecords((current) => current.filter((item) => item.id !== entry.id));
      notify(`${entry.record?.name || entry.record?.id || "Record"} permanently deleted.`);
    } catch (error) {
      notify(error.message || "Could not permanently delete this record.");
    }
  };
  const handleSignIn = async (selected, pin) => {
    const newSession = await signIn(selected.role === "admin" ? "admin" : selected.id, pin);
    if (newSession.role === "admin") {
      setProfile(newSession);
      setSession(newSession);
      try {
        const managedProfiles = await loadManagedProfiles();
        setSalespeople(managedProfiles.salespeople);
      } catch (error) {
        notify(error.message || "Could not load salesperson profiles.");
      }
    } else setSalespeople((current) => current.map((person) => person.id === newSession.id ? newSession : person));
    setSession(newSession);
    setAuthError("");
    setActivePage("dashboard");
    setQuery("");
    return true;
  };
  const signOut = () => {
    setSession(null);
    setActivePage("dashboard");
    activePageRef.current = "dashboard";
    setQuery("");
    setModalState(null);
    modalHistoryRef.current.clear();
    activeModalHistoryIdRef.current = null;
    window.history.replaceState({ drbApp: true, page: "dashboard", modalId: null }, "");
    requestSignOut().catch((error) => {
      console.error("Could not revoke the signed-out session:", error);
      notify("Signed out on this device, but the server session could not be revoked.");
    });
  };
  const handleProfileSave = async (updatedProfile) => {
    const id = role === "admin" ? "admin" : session.id;
    const savedProfile = await saveProfile(id, updatedProfile);
    if (role === "admin") setProfile(savedProfile);
    else setSalespeople(salespeople.map((person) => person.id === session.id ? savedProfile : person));
    setModal(null);
    notify("Profile updated successfully.");
  };
  const handleStaffSave = async (details) => {
    if (!details.id && salespeople.length >= 6) {
      notify("You can create a maximum of six salesperson profiles.");
      return;
    }
    const { id, pin, ...profileDetails } = details;
    const updated = id
      ? await saveProfile(id, { ...profileDetails, ...(pin ? { pin } : {}) })
      : await createStaff({ ...profileDetails, pin });
    setSalespeople((current) => id
      ? current.map((person) => person.id === id ? updated : person)
      : [...current, updated]);
    setModal(null);
    notify(id ? "Salesperson profile updated." : "Salesperson profile created.");
  };
  const handleStaffDelete = async (person) => {
    if (!window.confirm(`Move ${person.name}'s profile to Recently deleted? It can be restored for three days.`)) return;
    try {
      const { deletedRecord } = await deleteStaff(person.id);
      setDeletedRecords((current) => [deletedRecord, ...current.filter((item) => item.id !== deletedRecord.id)]);
      setSalespeople(salespeople.filter((item) => item.id !== person.id));
      if (session?.id === person.id) signOut();
      setModal(null);
      notify("Salesperson profile moved to Recently deleted.");
    } catch (error) {
      notify(error.message || "Could not remove this profile.");
    }
  };
  const handleStaffToggle = async (personId) => {
    const person = salespeople.find((item) => item.id === personId);
    if (!person) return;
    try {
      const updated = await saveProfile(personId, { active: person.active === false });
      setSalespeople(salespeople.map((item) => item.id === personId ? updated : item));
      notify("Salesperson profile status updated.");
    } catch (error) {
      notify(error.message || "Could not update this profile.");
    }
  };
  const handleAdminPinUpdate = async (currentPin, newPin) => {
    try {
      await updateAdminPin(currentPin, newPin);
      setModal(null);
      notify("Administrator PIN updated.");
      return true;
    } catch (error) {
      if (error.status === 401) return false;
      throw error;
    }
  };
  const handleArticleSubmit = (event, editingArticleId = null, closeModal = true) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const priceMin = Number(form.get("priceMin"));
    const category = form.get("category");
    const next = {
      id: editingArticleId || nextCategoryArticleNumber(articles, category),
      name: form.get("name").trim(),
      category,
      price: priceMin,
      priceMin,
      priceMax: priceMin,
      minOrder: Number(form.get("minOrder")),
      status: editingArticleId ? articles.find((item) => item.id === editingArticleId)?.status || "Available" : "Available",
      photo: form.get("photoData") || "",
      color: form.get("color") || "rose",
    };
    if (!editingArticleId && articles.some((item) => item.id.toLowerCase() === next.id.toLowerCase())) { notify("That article number is already in use."); return; }
    if (editingArticleId && role !== "admin") {
      void requestApproval({
        entityType: "article",
        action: "edit",
        recordId: editingArticleId,
        proposedRecord: next,
      }, `Article ${editingArticleId} changes sent to the administrator for approval.`);
      return;
    }
    setArticles(editingArticleId
      ? articles.map((item) => item.id === editingArticleId ? next : item)
      : [next, ...articles]);
    if (editingArticleId) setBookings(bookings.map((booking) => {
      if (!bookingArticleIds(booking).includes(editingArticleId)) return booking;
      const updatedArticles = booking.articles?.map((item) => typeof item === "string"
        ? item === editingArticleId ? { ...next } : item
        : item.id === editingArticleId ? { ...item, name: next.name, photo: next.photo, category: next.category } : item);
      return { ...booking, ...(updatedArticles ? { articles: updatedArticles } : {}), articleName: bookingArticleIds(booking).map((id) => id === editingArticleId ? next.name : articles.find((item) => item.id === id)?.name || id).join(", ") };
    }));
    if (closeModal) setModal(null);
    notify(editingArticleId ? "Article changes saved." : "Article added to your collection.");
    return next;
  };
  const handleArticleDelete = async (article) => {
    if (role !== "admin") {
      await requestApproval({ entityType: "article", action: "delete", recordId: article.id }, `Article ${article.id} deletion sent to the administrator for approval.`);
      return;
    }
    const activeBooking = bookings.find((booking) => bookingArticleIds(booking).includes(article.id)
      && !["Returned", "Cancelled"].includes(booking.status));
    if (activeBooking) {
      notify(`This article is reserved in booking ${activeBooking.id}. Complete or cancel that booking before deleting it.`);
      return;
    }
    if (!window.confirm(`Move ${article.name} (${article.id}) to Recently deleted? It can be restored for three days.`)) return;
    moveToRecentlyDeleted("article", article);
    setArticles((current) => current.filter((item) => item.id !== article.id));
    setModal(null);
    notify("Article moved to Recently deleted.");
  };
  const handleBookingSubmit = async (event, editingBookingId = null) => {
    event.preventDefault();
    const showBookingError = (message) => setBookingFormError(message);
    const form = new FormData(event.currentTarget);
    const selectedIds = form.getAll("articles").map(String);
    const selectedArticles = articles.filter((item) => selectedIds.includes(item.id));
    const existing = editingBookingId ? bookings.find((item) => item.id === editingBookingId) : null;
    const customerDetails = {
      name: String(form.get("customerName") || "").trim(),
      phone: String(form.get("customerPhone") || "").trim(),
      phone2: String(form.get("customerPhone2") || "").trim(),
      address: String(form.get("customerAddress") || "").trim(),
    };
    if (selectedArticles.length !== selectedIds.length) {
      showBookingError("Check the selected articles and try again.");
      return;
    }
    if (!customerDetails.name || !customerDetails.phone || !customerDetails.address || (editingBookingId && !existing)) {
      showBookingError("Enter the customer name, phone number, and address.");
      return;
    }
    const phoneError = validatePakistaniPhone(customerDetails.phone)
      || (customerDetails.phone2 ? validatePakistaniPhone(customerDetails.phone2) : "");
    if (phoneError) {
      showBookingError(phoneError);
      return;
    }
    setBookingFormError("");
    const previousCustomer = existing && customers.find((item) => item.id === existing.customerId || item.name === existing.customer);
    const customer = {
      ...(previousCustomer || {}),
      id: previousCustomer?.id || createRecordId("CUS"),
      ...customerDetails,
      city: previousCustomer?.city || "",
      cnic: previousCustomer?.cnic || "—",
      bookings: previousCustomer?.bookings || 0,
      due: previousCustomer?.due || 0,
    };
    const delivery = form.get("delivery"), returnDate = form.get("returnDate");
    const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "")
      && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!isIsoDate(delivery) || !isIsoDate(returnDate) || (!existing && delivery < today)) {
      showBookingError("Choose valid delivery and return dates using DD/MM/YYYY. New bookings cannot use past delivery dates.");
      return;
    }
    if (returnDate < delivery) {
      showBookingError("Return date must be on or after the delivery date.");
      return;
    }
    const shouldCheckAvailability = !existing || !["Returned", "Cancelled"].includes(existing.status);
    const clash = shouldCheckAvailability && selectedArticles.flatMap((article) => {
      const conflictingBooking = bookings.find((booking) => booking.id !== editingBookingId && bookingArticleIds(booking).includes(article.id) && !["Returned", "Cancelled"].includes(booking.status)
        && delivery <= booking.returnDate && returnDate >= booking.delivery);
      return conflictingBooking ? [{ article, booking: conflictingBooking }] : [];
    })[0];
    if (clash) { showBookingError(`Date conflict: ${clash.article.id} is reserved for ${clash.booking.customer} until ${readableDate(clash.booking.returnDate)}.`); return; }
    const amount = Number(form.get("amount")), paid = Number(form.get("paid"));
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paid) || paid < 0) {
      showBookingError("Enter a rental amount greater than zero and a valid advance payment.");
      return;
    }
    if (amount < paid) { showBookingError("Rental amount cannot be less than the advance already paid."); return; }
    if (existing && paid !== existing.paid) { showBookingError("Payments must be changed from the Payments page."); return; }
    const normalizedArticles = selectedArticles.map(({ id, name, photo, price, category }) => ({ id, name, photo, price, category }));
    const existingBooking = existing ? { ...existing } : {};
    delete existingBooking.event;
    const nextBooking = {
      ...existingBooking,
      id: existing?.id || `BK-${today.slice(0, 4)}-${randomRecordSuffix()}`,
      bookingDate: existing ? existing.bookingDate : today,
      createdBy: existing ? existing.createdBy || existing.staff || currentProfile.name : currentProfile.name,
      createdById: existing ? existing.createdById : currentUserId,
      customerId: customer.id,
      customer: customer.name,
      phone: customer.phone,
      phone2: customer.phone2 || "",
      address: customer.address,
      articles: normalizedArticles,
      article: normalizedArticles.map((item) => item.id).join(", "),
      articleName: normalizedArticles.map((item) => item.name).join(", "),
      delivery,
      returnDate,
      amount,
      paid,
      chest: form.get("chest") || existing?.chest || "",
      back: form.get("back") || existing?.back || "",
      hip: form.get("hip") || existing?.hip || "",
      status: existing?.status || "Confirmed",
      staff: existing?.staff || (existing ? existing.createdBy : currentProfile.name),
      notes: form.get("notes"),
    };
    if (existing) {
      if (role !== "admin") {
        await requestApproval({
          entityType: "booking",
          action: "edit",
          recordId: existing.id,
          proposedRecord: nextBooking,
        }, `Booking ${existing.id} changes sent to the administrator for approval.`);
        return;
      }
      setCustomers(previousCustomer
        ? customers.map((item) => item.id === customer.id ? customer : item)
        : [customer, ...customers]);
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
    setCustomers([customer, ...customers]);
    setBookings([nextBooking, ...bookings]);
    setArticles(articles.map((item) => selectedIds.includes(item.id) && item.status !== "Maintenance" ? { ...item, status: "Booked" } : item));
    if (paid > 0) setPayments([{
      id: createRecordId("PAY"),
      booking: nextBooking.id,
      customer: nextBooking.customer,
      date: today,
      amount: paid,
      method: form.get("method"),
      receivedBy: currentProfile.name,
      receivedById: currentUserId,
    }, ...payments]);
    setBookingDraft(null);
    setModal({ type: "booking-detail", booking: nextBooking }, { replace: true });
    notify(`Booking ${nextBooking.id} created successfully.`);
  };
  const handleSaleSubmit = async (event, editingSaleId = null) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const paid = Number(form.get("paid"));
    const existingSale = editingSaleId && sales.find((item) => item.id === editingSaleId);
    const amount = existingSale ? Number(existingSale.amount) : paid;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paid) || paid < 0 || paid > amount) {
      notify("Enter a valid amount received no greater than the sale amount.");
      return;
    }
    const sale = {
      id: editingSaleId || createRecordId("SALE"),
      date: form.get("date"),
      customer: form.get("customer").trim(),
      phone: form.get("phone").trim(),
      itemDescription: form.get("itemDescription").trim(),
      deliveryDate: String(form.get("deliveryDate") || ""),
      amount,
      paid,
      method: form.get("method"),
      notes: form.get("notes").trim(),
      createdBy: currentProfile.name,
      createdById: currentUserId,
    };
    if (editingSaleId && role !== "admin") {
      await requestApproval({
        entityType: "sale",
        action: "edit",
        recordId: editingSaleId,
        proposedRecord: sale,
      }, `Sale ${editingSaleId} changes sent to the administrator for approval.`);
      return;
    }
    setSales((current) => editingSaleId
      ? current.map((item) => item.id === editingSaleId ? sale : item)
      : [sale, ...current]);
    setModal(null);
    notify(editingSaleId ? `Sale ${sale.id} updated successfully.` : `Sale ${sale.id} recorded successfully.`);
  };
  const handleSaleDelete = async (sale) => {
    if (role !== "admin") {
      await requestApproval({ entityType: "sale", action: "delete", recordId: sale.id }, `Sale ${sale.id} deletion sent to the administrator for approval.`);
      return;
    }
    if (!window.confirm(`Move sale ${sale.id} for ${sale.customer} to Recently deleted? It can be restored for three days.`)) return;
    moveToRecentlyDeleted("sale", sale);
    setSales((current) => current.filter((item) => item.id !== sale.id));
    notify(`Sale ${sale.id} moved to Recently deleted.`);
  };
  const handleBookingDelete = async (booking) => {
    if (role !== "admin") {
      await requestApproval({ entityType: "booking", action: "delete", recordId: booking.id }, `Booking ${booking.id} deletion sent to the administrator for approval.`);
      return;
    }
    const linkedPayments = payments.filter((payment) => payment.booking === booking.id).length;
    const paymentWarning = linkedPayments ? ` Its ${linkedPayments} linked payment record(s) will be moved with it.` : "";
    if (!window.confirm(`Move booking ${booking.id} for ${booking.customer} to Recently deleted?${paymentWarning} It can be restored for three days.`)) return;
    moveToRecentlyDeleted("booking", booking, {
      payments: payments.filter((payment) => payment.booking === booking.id),
    });
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
    notify(`Booking ${booking.id} moved to Recently deleted.`);
  };
  const handleCustomerSubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = { id: createRecordId("CUS"), name: form.get("name").trim(), phone: form.get("phone").trim(), phone2: form.get("phone2").trim(), address: form.get("address").trim(), city: form.get("city").trim(), cnic: form.get("cnic") || "—", bookings: 0, due: 0 };
    setCustomers([next, ...customers]); setModal(null); notify("Customer added successfully.");
  };
  const handlePaymentSubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const booking = bookings.find((item) => item.id === form.get("booking"));
    if (!booking) { notify("Choose a valid booking for this payment."); return; }
    const amount = Number(form.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) { notify("Enter a payment amount greater than zero."); return; }
    if (amount > Math.max(booking.amount - booking.paid, 0)) { notify("Payment cannot exceed the booking's remaining balance."); return; }
    setPayments([{
      id: createRecordId("PAY"),
      booking: booking.id,
      customer: booking.customer,
      date: today,
      amount,
      method: form.get("method"),
      receivedBy: currentProfile.name,
      receivedById: currentUserId,
    }, ...payments]);
    setBookings(bookings.map((item) => item.id === booking.id ? { ...item, paid: item.paid + amount } : item));
    setCustomers(customers.map((item) => item.id === booking.customerId || item.name === booking.customer
      ? { ...item, due: Math.max(Number(item.due || 0) - amount, 0) }
      : item));
    setModal(null); notify("Payment recorded successfully.");
  };
  const handleReturn = (bookingId) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking || booking.status !== "Out") {
      notify("Only a booking marked as picked up can be returned.");
      return;
    }
    if (!window.confirm(`Confirm that ${bookingArticleTitles(booking) || "the booked articles"} were returned by ${booking.customer}?`)) return;
    const bookingIds = bookingArticleIds(booking);
    const articleHasOtherActiveBooking = (articleId) => bookings.some((item) => item.id !== bookingId && bookingArticleIds(item).includes(articleId) && !["Returned", "Cancelled"].includes(item.status));
    setBookings(bookings.map((item) => item.id === bookingId ? { ...item, status: "Returned", actualReturn: today } : item));
    setArticles(articles.map((item) => bookingIds.includes(item.id) && item.status !== "Maintenance" ? { ...item, status: articleHasOtherActiveBooking(item.id) ? "Booked" : "Available" } : item));
    notify(`${bookingArticleTitles(booking)} marked as returned.`);
  };
  const handleBookingStatusChange = (booking, nextStatus) => {
    if (nextStatus === "Out") {
      if (booking.status !== "Confirmed") return;
      if (booking.paid < booking.amount) {
        notify("Record the remaining payment before marking this booking as picked up.");
        return;
      }
      if (!window.confirm(`Confirm that booking ${booking.id} for ${booking.customer} has been picked up?`)) return;
      setBookings(bookings.map((item) => item.id === booking.id ? { ...item, status: "Out", pickedUpAt: today } : item));
      notify(`Booking ${booking.id} marked as picked up. Payment is clear.`);
      return;
    }
    if (nextStatus === "Returned") handleReturn(booking.id);
  };
  if (bootStage === "splash" || !authReady) return <SplashScreen />;
  if (!session) return <AccessScreen
    adminProfile={profile}
    adminPin={adminConfigured}
    salespeople={salespeople}
    authError={authError}
    onAdminSetup={handleAdminSetup}
    onSignIn={handleSignIn}
  />;
  const filteredQuery = query;
  const openArticleModal = () => setModal({ type: "article" });
  const openEditArticle = (article) => setModal({ type: "article-edit", article });
  const openEditBooking = (booking) => {
    setModal({ type: "booking-edit", booking });
  };
  const openEditSale = (sale) => setModal({ type: "sale-edit", sale });
  const openCustomerModal = () => setModal({ type: "customer" });
  const openPaymentModal = () => setModal({ type: "payment" });
  const openAddStaff = () => {
    if (salespeople.length >= 6) {
      notify("All six salesperson profiles have been created. Remove one to add another.");
      return;
    }
    setModal({ type: "staff-create" });
  };
  const dashboardBookings = bookings;
  const pendingApprovalCount = approvalRequests.filter((item) => item.status === "Pending").length;
  const deliveryPrepCount = deliveryPrepBookings(bookings, articles, prepDateRange)
    .reduce((count, booking) => count + booking.deliveryArticles.length, 0);
  const content = (() => {
    if (activePage === "approvals" && role === "admin") {
      return <ApprovalsPage requests={approvalRequests} error={approvalError} onReview={decideApproval} />;
    }
    if (activePage === "recently-deleted") {
      return role === "admin"
        ? <RecentlyDeletedPage records={deletedRecords} onRestore={handleDeletedRecordRestore} onPermanentlyDelete={handleDeletedRecordPurge} />
        : <EmptyState title="Administrator access required" detail="Recently deleted records are only available to an administrator." />;
    }
    switch (activePage) {
      case "articles": return <ArticlesPage articles={articles} query={filteredQuery} onQueryChange={setQuery} onAdd={openArticleModal} onEdit={openEditArticle} />;
      case "bookings": return <BookingsPage bookings={bookings} articles={articles} query={filteredQuery} onQueryChange={setQuery} onNew={() => setModal({ type: "booking" })} onView={(booking) => setModal({ type: "booking-detail", booking })} isAdmin={role === "admin"} onEdit={openEditBooking} onDelete={handleBookingDelete} onStatusChange={handleBookingStatusChange} onRecordPayment={(booking) => setModal({ type: "payment", bookingId: booking.id })} />;
      case "sales": return <SalesPage sales={sales} query={filteredQuery} onQueryChange={setQuery} onNew={() => setModal({ type: "sale" })} onEdit={openEditSale} onDelete={handleSaleDelete} />;
      case "jewellery-bookings": return <BookingsPage bookings={bookings} articles={articles} query={filteredQuery} onQueryChange={setQuery} onNew={() => setModal({ type: "booking" })} onView={(booking) => setModal({ type: "booking-detail", booking })} isAdmin={role === "admin"} onEdit={openEditBooking} onDelete={handleBookingDelete} onStatusChange={handleBookingStatusChange} onRecordPayment={(booking) => setModal({ type: "payment", bookingId: booking.id })} jewelleryOnly />;
      case "customers": return <CustomersPage customers={customers} query={filteredQuery} onQueryChange={setQuery} onAdd={openCustomerModal} />;
      case "payments": return <PaymentsPage payments={payments} bookings={bookings} query={filteredQuery} onQueryChange={setQuery} onAdd={openPaymentModal} isAdmin={role === "admin"} currentUserId={currentUserId} currentUserName={currentProfile.name} salespeople={salespeople} adminProfile={profile} />;
      case "returns": return <ReturnsPage bookings={bookings} onReturn={handleReturn} onStatusChange={handleBookingStatusChange} onRecordPayment={(booking) => setModal({ type: "payment", bookingId: booking.id })} />;
      case "tomorrow": return <TomorrowDeliveriesPage bookings={bookings} articles={articles} dateRange={prepDateRange} onRangeChange={setPrepDateRange} onToggleReady={togglePrepReady} />;
      case "calendar": return <CalendarPage bookings={bookings} articles={articles} onNew={() => setModal({ type: "booking" })} onView={(booking) => setModal({ type: "booking-detail", booking })} />;
      case "reports": return <ReportsPage bookings={bookings} payments={payments} articles={articles} />;
      case "staff": return <StaffPage salespeople={salespeople} onAdd={openAddStaff} onEdit={(person) => setModal({ type: "staff-edit", person })} onToggle={handleStaffToggle} onDelete={handleStaffDelete} onChangeAdminPin={() => setModal({ type: "admin-pin" })} />;
      case "settings": return <SettingsPage language={language} onLanguageChange={setLanguage} business={businessSettings} onSaveBusiness={setBusinessSettings} notifications={notificationSettings} onNotificationsChange={setNotificationSettings} onChangeAdminPin={() => setModal({ type: "admin-pin" })} onManageStaff={() => nav("staff")} onNotify={notify} />;
      case "profile": return <ProfilePage profile={currentProfile} role={role} onEdit={() => setModal({ type: "profile-edit" })} />;
      default: return <Dashboard articles={articles} bookings={dashboardBookings} payments={payments} role={role} profile={currentProfile} onNavigate={nav} />;
    }
  })();
  const detailArticles = modal?.type === "booking-detail" ? bookingArticleRecords(modal.booking, articles) : [];

  return <div className="app-shell">
    <div className={`pull-refresh-indicator${pullRefresh.active ? " pull-refresh-active" : ""}`} style={{ top: `calc(env(safe-area-inset-top) + ${pullRefresh.distance - 48}px)` }} role="status" aria-live="polite">
      <RefreshCw size={17} /><span>{pullRefresh.active ? "Refreshing cloud data…" : pullRefresh.distance >= 68 ? "Release to refresh" : "Pull to refresh"}</span>
    </div>
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span>DR</span><i>✦</i></div><div className="brand-name"><strong>Dulhan Rani</strong><span>BOUTIQUE MANAGEMENT</span></div><button className="sidebar-close icon-button" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-avatar">{businessSettings.name.slice(0, 1) || "D"}</span><span><strong>{businessSettings.name}</strong><small>{businessSettings.address || "Workspace"}</small></span><ChevronDown size={15} /></div>
      <nav className="side-nav">{visibleGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>
        {group.items.map(({ id, label, icon: Icon, badge }) => <button key={id} className={`nav-item ${activePage === id ? "nav-active" : ""}`} onClick={() => nav(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{(badge || id === "tomorrow") && <small className="nav-badge">{badge === "approvals" ? pendingApprovalCount : id === "articles" ? articles.length : id === "tomorrow" ? deliveryPrepCount : bookings.filter((booking) => !["Returned", "Cancelled"].includes(booking.status) && booking.returnDate >= today).length}</small>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="support-card"><span className="support-sparkle"><Sparkles size={16} /></span><strong>Need a hand?</strong><span>We’re here to help you get started.</span><button onClick={() => notify("Help center will be available soon.")}>Visit help center <ChevronRight size={14} /></button></div><button className="sidebar-profile" onClick={() => nav("profile")}><span className="avatar avatar-plum">{currentProfile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span><strong>{currentProfile.name}</strong><small>{role === "admin" ? "Administrator" : "Salesperson"}</small></span><MoreHorizontal size={17} /></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageTitles[activePage]}</strong></div></div>
      <div className="topbar-right"><Button icon={Plus} onClick={() => nav("new-booking")} className="topbar-create-booking" aria-label="Create booking"><span>Create Booking</span></Button><label className="global-search"><Search size={16} /><input placeholder="Search anything..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
        <div className="notification-wrap"><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18} />{hasNotifications && <i />}</button>
          {notificationsOpen && <div className="notification-popover"><strong>Notifications</strong>
            {configuredNotifications.returns && returnAlerts.slice(0, 3).map((booking) => <div key={`return-${booking.id}`}><span className="notification-dot" /><p><b>Return due or overdue</b><small>{bookingArticleTitles(booking) || booking.id} · {booking.customer}</small></p></div>)}
            {configuredNotifications.payments && paymentAlerts.slice(0, 3).map((booking) => <div key={`payment-${booking.id}`}><span className="notification-dot notification-orange" /><p><b>Payment follow-up</b><small>{currency(Math.max(Number(booking.amount) - Number(booking.paid), 0))} due · {booking.customer}</small></p></div>)}
            {configuredNotifications.bookings && bookingAlerts.slice(0, 3).map((booking) => <div key={`booking-${booking.id}`}><span className="notification-dot" /><p><b>Delivery scheduled today</b><small>{bookingArticleTitles(booking) || booking.id} · {booking.customer}</small></p></div>)}
            {!hasNotifications && <p>No current alerts.</p>}
            <button onClick={() => { nav("returns"); setNotificationsOpen(false); }}>View all alerts <ChevronRight size={14} /></button></div>}</div>
        <span className="topbar-divider" /><ProfileMenu role={role} profile={currentProfile} onProfile={() => nav("profile")} onSignOut={signOut} /></div></header>
      <div className="page-content">{content}<footer className="app-footer"><span>© {new Date().getFullYear()} {businessSettings.name}</span><span className={`sync-indicator sync-${syncStatus}`} role="status" title={syncError}><i />{syncStatus === "synced" ? "Cloud synced · local backup saved" : syncStatus === "syncing" ? "Syncing · local backup saved" : "Cloud unavailable · saved locally"}</span><span>Made for your boutique <span className="heart">♥</span></span></footer></div>
    </main>
    {modal?.type === "article" && <Modal title="Add new article" description="Add a rental piece to your boutique collection." onClose={() => setModal(null)}>
      <ArticleForm onSubmit={handleArticleSubmit} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "article-edit" && <Modal title="Edit article" description="Update article details or replace and crop its photo." onClose={() => setModal(null)}>
      <ArticleForm article={modal.article} onSubmit={handleArticleSubmit} onCancel={() => setModal(null)} onDelete={handleArticleDelete} isAdmin={role === "admin"} />
    </Modal>}
    {modal?.type === "booking" && <Modal title="Create a booking" onClose={() => { setBookingDraft(null); setBookingFormError(""); setModal(null); }} wide>
      <BookingForm draft={bookingDraft} formError={bookingFormError} onErrorChange={() => setBookingFormError("")} articles={articles} customers={customers} onSubmit={handleBookingSubmit} onCancel={() => { setBookingDraft(null); setBookingFormError(""); setModal(null); }} onAddArticle={(category, draft) => { setBookingDraft(draft); setModal({ type: "booking-article", quickArticleCategory: category }); }} addedArticleId={quickCreatedArticleId} onAddedArticleHandled={() => setQuickCreatedArticleId("")} />
    </Modal>}
    {modal?.type === "sale" && <Modal title="Record a sale" description="Record a sale without rental dates or measurements." onClose={() => setModal(null)}>
      <SaleForm onSubmit={handleSaleSubmit} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "sale-edit" && <Modal title="Edit sale" description={`Update sale ${modal.sale.id}.`} onClose={() => setModal(null)}>
      <SaleForm key={modal.sale.id} sale={modal.sale} onSubmit={(event) => handleSaleSubmit(event, modal.sale.id)} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "booking-article" && <Modal title="Add an article" description="Create an inventory article, then it will be selected in this booking." onClose={() => setModal(null)}>
      <ArticleForm initialCategory={modal.quickArticleCategory} onSubmit={(event) => handleArticleSubmit(event, null, false)} onSaved={(article) => { setQuickCreatedArticleId(article.id); setModal(null); }} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "booking-edit" && <Modal title={role === "admin" ? "Edit booking" : "Request booking changes"} description={`Update reservation details for ${modal.booking.id}.`} onClose={() => setModal(null)} wide>
      <BookingForm key={modal.booking.id} booking={modal.booking} articles={articles} customers={customers} onSubmit={handleBookingSubmit} onCancel={() => setModal(null)} />
    </Modal>}
    {modal?.type === "customer" && <Modal title="Add customer" description="Save customer contact details for future bookings." onClose={() => setModal(null)}>
      <form className="form-grid" onSubmit={handleCustomerSubmit}><Field label="Customer name *"><input name="name" placeholder="Full name" required /></Field><Field label="Phone number 1 *"><input name="phone" type="tel" placeholder="+92 300 0000000" required /></Field><Field label="Phone number 2 (optional)"><input name="phone2" type="tel" placeholder="+92 300 0000000" /></Field><Field label="CNIC number"><input name="cnic" placeholder="Optional" /></Field><Field label="Area / street address *"><input name="address" placeholder="e.g. Gulberg III" required /></Field><Field label="City *"><input name="city" list="customer-cities" placeholder="Select or type a city" required /><CityOptions /></Field><div className="modal-actions"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" icon={Plus}>Save customer</Button></div></form>
    </Modal>}
    {modal?.type === "payment" && <Modal title="Record a payment" description="Add a payment against an active rental booking." onClose={() => setModal(null)}>
      <form className="form-grid" onSubmit={handlePaymentSubmit} key={modal.bookingId || "all-bookings"}><Field label="Booking *" className="field-full"><select name="booking" required defaultValue={modal.bookingId || ""} onChange={(event) => {
        const selectedBooking = bookings.find((item) => item.id === event.target.value);
        const amountField = event.currentTarget.form?.elements.namedItem("amount");
        if (selectedBooking && amountField) amountField.value = String(Math.max(selectedBooking.amount - selectedBooking.paid, 0));
      }}><option value="" disabled>Choose booking</option>{bookings.filter((b) => b.amount > b.paid).map((booking) => <option key={booking.id} value={booking.id}>{booking.id} · {booking.customer} · Due {currency(booking.amount - booking.paid)}</option>)}</select></Field><Field label="Amount received (PKR) *"><input name="amount" type="number" min="1" required placeholder="2500" defaultValue={modal.bookingId ? Math.max((bookings.find((item) => item.id === modal.bookingId)?.amount || 0) - (bookings.find((item) => item.id === modal.bookingId)?.paid || 0), 0) : ""} /></Field><Field label="Payment method *"><select name="method"><option>Cash</option><option>Bank transfer</option><option>JazzCash</option><option>Easypaisa</option></select></Field><div className="modal-actions"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" icon={Wallet}>Record payment</Button></div></form>
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
    {modal?.type === "booking-detail" && <Modal title="Booking details" description={`${modal.booking.id} · Created by ${modal.booking.createdBy || modal.booking.staff || "Unknown"}`} onClose={() => setModal(null)} className="receipt-modal">
      <div className="booking-detail"><header className="receipt-brand"><h1>{businessSettings.name || defaultBusinessSettings.name}</h1><p>{businessSettings.address}</p><p>{businessSettings.phone}{businessSettings.email ? ` · ${businessSettings.email}` : ""}</p><strong>Booking receipt · {modal.booking.id}</strong></header>
        <div className="detail-highlight"><span><CalendarDays size={20} /></span><div><strong>{modal.booking.customer}</strong><small><Phone size={13} />{modal.booking.phone || "No phone number"}</small></div><Status className="receipt-booking-status">{modal.booking.status}</Status></div>
        <div className="detail-lines"><div><span>Booking date</span><strong>{readableDate(modal.booking.bookingDate)}</strong></div><div><span>Booked by</span><strong>{modal.booking.createdBy || modal.booking.staff || "Unknown"}</strong></div><div><span>Outfits</span><strong>{detailArticles.filter((article) => article.category !== "Jewellery Set").map((article) => article.name).join(", ") || "—"}</strong><small>{detailArticles.filter((article) => article.category !== "Jewellery Set").map((article) => article.id).join(", ")}</small></div><div><span>Jewellery sets</span><strong>{detailArticles.filter((article) => article.category === "Jewellery Set").map((article) => article.name).join(", ") || "—"}</strong><small>{detailArticles.filter((article) => article.category === "Jewellery Set").map((article) => article.id).join(", ")}</small></div><div><span>Delivery date</span><strong>{readableDate(modal.booking.delivery)}</strong></div><div><span>Return date</span><strong>{readableDate(modal.booking.returnDate)}</strong></div>{detailArticles.some((article) => article.category !== "Jewellery Set") && <div><span>Measurements</span><strong>{[modal.booking.chest && `Chest ${modal.booking.chest} in`, modal.booking.back && `Back ${modal.booking.back} in`, modal.booking.hip && `Hip ${modal.booking.hip} in`].filter(Boolean).join(" · ") || "Not provided"}</strong></div>}<div><span>Rental amount</span><strong>{currency(modal.booking.amount)}</strong></div><div><span>Paid to date</span><strong>{currency(modal.booking.paid)}</strong></div><div><span>Remaining balance</span><strong className={modal.booking.amount > modal.booking.paid ? "due-text" : "paid-text"}>{currency(Math.max(modal.booking.amount - modal.booking.paid, 0))}</strong></div></div>
        <section className="receipt-payment-history"><h3>Payment collection history</h3>
          {payments.filter((payment) => payment.booking === modal.booking.id).length
            ? <div className="table-scroll"><table><thead><tr><th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>RECEIVED BY</th></tr></thead><tbody>
              {payments.filter((payment) => payment.booking === modal.booking.id).map((payment) => <tr key={payment.id}><td>{readableDate(payment.date)}</td><td>{currency(payment.amount)}</td><td>{payment.method}</td><td>{payment.receivedBy || "Unknown"}</td></tr>)}
            </tbody></table></div>
            : <p>No payment has been recorded yet.</p>}
        </section>
        {businessSettings.receiptFooter && <p className="receipt-footer">{businessSettings.receiptFooter}</p>}
        <Button variant="outline" icon={FileText} onClick={() => window.print()}>Print booking receipt</Button><div className="booking-detail-admin-actions"><Button variant="outline" icon={Pencil} onClick={() => openEditBooking(modal.booking)}>{role === "admin" ? "Edit booking" : "Request changes"}</Button><Button variant="outline" icon={Trash2} onClick={() => handleBookingDelete(modal.booking)}>{role === "admin" ? "Delete booking" : "Request deletion"}</Button></div></div></Modal>}
    {toast && <div className="toast" role="status" aria-live="polite"><span><Check size={18} /></span><strong>{toast}</strong><button onClick={() => { window.clearTimeout(toastTimer.current); setToast(""); }} aria-label="Dismiss"><X size={17} /></button></div>}
  </div>;
}

function BookingForm({ booking, draft, formError, onErrorChange, articles, customers, onSubmit, onCancel, onAddArticle, addedArticleId, onAddedArticleHandled }) {
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [selectedArticleIds, setSelectedArticleIds] = useState(booking ? bookingArticleIds(booking) : draft?.selectedArticleIds || []);
  const selectedArticles = articles.filter((item) => selectedArticleIds.includes(item.id));
  const jewelleryOnly = selectedArticles.length > 0 && selectedArticles.every((item) => item.category === "Jewellery Set");
  const [deliveryDate, setDeliveryDate] = useState(booking?.delivery || draft?.delivery || "");
  const [articleCategory, setArticleCategory] = useState("All categories");
  const [articleSearch, setArticleSearch] = useState("");
  const categories = categoriesForArticles(articles);
  const hasOutfit = selectedArticles.some((item) => item.category !== "Jewellery Set");
  const hideMeasurements = !hasOutfit
    && (articleCategory === "Jewellery Set" || (articleCategory === "All categories" && jewelleryOnly));
  const matchingArticles = articles.filter((item) => (item.status === "Available" || selectedArticleIds.includes(item.id))
    && item.category !== "Jewellery Set"
    && (articleCategory === "All categories" || item.category === articleCategory)
    && (selectedArticleIds.includes(item.id) || !articleSearch.trim() || `${item.id} ${item.name} ${item.category}`.toLowerCase().includes(articleSearch.trim().toLowerCase())));
  const jewellerySets = articles.filter((item) => item.category === "Jewellery Set"
    && (item.status === "Available" || selectedArticleIds.includes(item.id)));
  const toggleArticle = (article, checked) => {
    const nextIds = checked ? [...selectedArticleIds, article.id] : selectedArticleIds.filter((id) => id !== article.id);
    setSelectedArticleIds(nextIds);
  };
  const previousCustomer = booking && customers.find((customer) => customer.id === booking.customerId || customer.name === booking.customer);
  const [customerDetails, setCustomerDetails] = useState({
    name: draft?.customerDetails?.name ?? booking?.customer ?? "",
    phone: draft?.customerDetails?.phone ?? booking?.phone ?? previousCustomer?.phone ?? "",
    phone2: draft?.customerDetails?.phone2 ?? booking?.phone2 ?? previousCustomer?.phone2 ?? "",
    address: draft?.customerDetails?.address ?? booking?.address ?? previousCustomer?.address ?? "",
  });
  const [amount, setAmount] = useState(booking ? String(booking.amount ?? "") : draft?.amount || "");
  const [paid, setPaid] = useState(booking ? String(booking.paid ?? "") : draft?.paid || "");
  const [returnDate, setReturnDate] = useState(booking?.returnDate || draft?.returnDate || "");
  const formActionsRef = useRef(null);
  useEffect(() => {
    if (formError) formActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [formError]);
  useEffect(() => {
    if (!addedArticleId || selectedArticleIds.includes(addedArticleId)) return;
    const updatedIds = [...selectedArticleIds, addedArticleId];
    setSelectedArticleIds(updatedIds);
    setArticleSearch("");
    onAddedArticleHandled();
  }, [addedArticleId]);
  const preserveDraftAndAddArticle = (category, form) => {
    const data = new FormData(form);
    onAddArticle(category, {
      selectedArticleIds: data.getAll("articles").map(String),
      customerDetails: {
        name: String(data.get("customerName") || ""),
        phone: String(data.get("customerPhone") || ""),
        phone2: String(data.get("customerPhone2") || ""),
        address: String(data.get("customerAddress") || ""),
      },
      delivery: String(data.get("delivery") || ""),
      returnDate: String(data.get("returnDate") || ""),
      amount: String(data.get("amount") || ""),
      paid: String(data.get("paid") || ""),
      method: String(data.get("method") || "Cash"),
      chest: String(data.get("chest") || ""),
      back: String(data.get("back") || ""),
      hip: String(data.get("hip") || ""),
      notes: String(data.get("notes") || ""),
    });
  };
  const submitBooking = async (event) => {
    event.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(event, booking?.id || null);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };
  return <form className="form-grid" noValidate onSubmit={submitBooking}>
    <div className="booking-article-picker field-full">
      <Field label="Category"><select aria-label="Filter articles by category" value={articleCategory} onChange={(event) => setArticleCategory(event.target.value)}><option>All categories</option>{categories.filter((category) => category !== "Jewellery Set").map((category) => <option key={category}>{category}</option>)}</select></Field>
      <label className="booking-article-search"><Search size={15} /><input type="search" aria-label="Search articles for booking" placeholder="Type article name or number..." value={articleSearch} onChange={(event) => setArticleSearch(event.target.value)} /></label>
      {onAddArticle && <Button type="button" variant="outline" icon={Plus} onClick={(event) => preserveDraftAndAddArticle(articleCategory === "All categories" ? undefined : articleCategory, event.currentTarget.closest("form"))}>Add new article to collection</Button>}
      <div className="booking-article-options">{matchingArticles.map((article) => <BookingArticleOption key={article.id} article={article} selected={selectedArticleIds.includes(article.id)} onToggle={toggleArticle} />)}
      {matchingArticles.length === 0 && <p className="booking-article-empty">{articleSearch.trim() ? "No matching articles found." : "No available articles."}</p>}</div>
      {selectedArticles.length > 0 && <p className="booking-selected-count">{selectedArticles.length} article{selectedArticles.length === 1 ? "" : "s"} selected</p>}
    </div>
    <div className="booking-customer-field field-full">
      <Field label="Customer name *"><input name="customerName" value={customerDetails.name} onChange={(event) => setCustomerDetails({ ...customerDetails, name: event.target.value })} placeholder="Customer name" required /></Field>
      <Field label="Phone number 1 *"><input name="customerPhone" type="tel" inputMode="tel" autoComplete="tel" value={customerDetails.phone} onChange={(event) => { setCustomerDetails({ ...customerDetails, phone: event.target.value }); onErrorChange(); }} placeholder="03XXXXXXXXX or +923XXXXXXXXX" required /></Field>
      <Field label="Phone number 2 (optional)"><input name="customerPhone2" type="tel" inputMode="tel" autoComplete="tel-national" value={customerDetails.phone2} onChange={(event) => { setCustomerDetails({ ...customerDetails, phone2: event.target.value }); onErrorChange(); }} placeholder="Optional" /></Field>
      <Field label="Address *" className="field-full"><input name="customerAddress" value={customerDetails.address} onChange={(event) => setCustomerDetails({ ...customerDetails, address: event.target.value })} placeholder="Customer address" required /></Field>
    </div>
    <Field label="Delivery date *"><DateInput name="delivery" ariaLabel="Delivery date" min={booking ? undefined : today} value={deliveryDate} onChange={(nextDate) => {
      setDeliveryDate(nextDate);
      setReturnDate(nextDate ? dateAfter(nextDate, 2) : "");
    }} required pickerOnly /></Field>
    <Field label="Expected return date *"><DateInput name="returnDate" ariaLabel="Expected return date" min={deliveryDate || (booking ? undefined : today)} value={returnDate} onChange={setReturnDate} required pickerOnly /></Field>
    <Field label="Agreed rental price (PKR) *"><input type="number" name="amount" min="1" placeholder="Enter rental price" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      {selectedArticles.length > 0 && <small className="suggested-price">Suggested total for {selectedArticles.length} article{selectedArticles.length === 1 ? "" : "s"}: {currency(selectedArticles.reduce((sum, item) => sum + item.price, 0))}</small>}</Field>
    <Field label={booking ? "Advance received (PKR)" : "Advance payment (PKR)"}><input type="number" name="paid" min="0" value={paid} onChange={(event) => setPaid(event.target.value)} readOnly={Boolean(booking)} />{booking && <small className="suggested-price">Payments are managed from the Payments page.</small>}</Field>
    {!booking && <Field label="Payment method"><select name="method" defaultValue={draft?.method || "Cash"}><option>Cash</option><option>Bank transfer</option><option>JazzCash</option><option>Easypaisa</option></select></Field>}
    <div className="booking-balance field-full"><span>Total rental <strong>{currency(amount)}</strong></span><span>Balance after advance <strong>{currency(Math.max(Number(amount || 0) - Number(paid || 0), 0))}</strong></span></div>
    {!hideMeasurements && <div className="booking-measurements field-full"><strong>Customer measurements <span>(optional · inches)</span></strong><div><Field label="Chest"><input name="chest" type="number" min="0" step="0.1" defaultValue={booking?.chest ?? draft?.chest ?? ""} placeholder="Chest size" /></Field><Field label="Back"><input name="back" type="number" min="0" step="0.1" defaultValue={booking?.back ?? draft?.back ?? ""} placeholder="Back size" /></Field><Field label="Hip"><input name="hip" type="number" min="0" step="0.1" defaultValue={booking?.hip ?? draft?.hip ?? ""} placeholder="Hip size" /></Field></div></div>}
    <Field label="Special instructions" className="field-full"><textarea name="notes" rows="2" defaultValue={booking?.notes ?? draft?.notes ?? ""} placeholder="Fitting notes, alterations, or other details..." /></Field>
    <section className="booking-jewellery-section field-full" aria-label="Jewellery set selection">
      <strong>Jewellery sets <span>Optional — book alone or with an outfit.</span></strong>
      {jewellerySets.length
        ? <div className="booking-article-options">{jewellerySets.map((article) => <BookingArticleOption key={article.id} article={article} selected={selectedArticleIds.includes(article.id)} onToggle={toggleArticle} icon={Gem} />)}</div>
        : <p className="booking-article-empty">No jewellery sets available. Add a Jewellery Set article to your collection.</p>}
      {onAddArticle && <Button type="button" variant="outline" icon={Plus} onClick={(event) => preserveDraftAndAddArticle("Jewellery Set", event.currentTarget.closest("form"))}>Add jewellery set</Button>}
    </section>
    {formError && <div className="booking-form-error field-full" role="alert" aria-live="assertive"><AlertTriangle size={18} /><span>{formError}</span></div>}
    <div className="modal-actions" ref={formActionsRef}><Button variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button><Button type="submit" icon={booking ? Check : CalendarDays} disabled={submitting}>{submitting ? "Saving booking…" : booking ? "Save changes" : "Confirm booking"}</Button></div>
  </form>;
}

function SaleForm({ sale, onSubmit, onCancel }) {
  const [date, setDate] = useState(sale?.date || today);
  const [paid, setPaid] = useState(sale ? String(sale.paid) : "");
  const [deliveryDate, setDeliveryDate] = useState(sale?.deliveryDate || "");
  return <form className="form-grid sale-form" onSubmit={onSubmit}>
    <Field label="Sale date *"><DateInput name="date" ariaLabel="Sale date" value={date} onChange={setDate} required /></Field>
    <Field label="Delivery date (optional)"><DateInput name="deliveryDate" ariaLabel="Optional delivery date" value={deliveryDate} onChange={setDeliveryDate} pickerOnly /></Field>
    <Field label="Customer name *"><input name="customer" defaultValue={sale?.customer || ""} placeholder="Customer name" required /></Field>
    <Field label="Phone number"><input name="phone" type="tel" defaultValue={sale?.phone || ""} placeholder="Optional" /></Field>
    <Field label="Item / sale details *" className="field-full"><input name="itemDescription" defaultValue={sale?.itemDescription || ""} placeholder="Describe the item or sale" required /></Field>
    <Field label="Amount received (PKR) *"><input name="paid" type="number" min={sale ? 0 : 1} value={paid} onChange={(event) => setPaid(event.target.value)} placeholder="Enter amount received" required /></Field>
    <Field label="Payment method"><select name="method" defaultValue={sale?.method || "Cash"}><option>Cash</option><option>Bank transfer</option><option>JazzCash</option><option>Easypaisa</option></select></Field>
    <Field label="Notes" className="field-full"><textarea name="notes" rows="2" defaultValue={sale?.notes || ""} placeholder="Optional notes..." /></Field>
    <div className="modal-actions"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={Check}>{sale ? "Save changes" : "Save sale"}</Button></div>
  </form>;
}

function BookingArticleOption({ article, selected, onToggle, icon: Icon = Shirt }) {
  return <label className={`booking-article-option${selected ? " selected" : ""}`}>
    <input type="checkbox" name="articles" value={article.id} checked={selected} onChange={(event) => onToggle(article, event.target.checked)} />
    {article.photo ? <img src={article.photo} alt="" /> : <span className="booking-article-option-placeholder"><Icon size={18} /></span>}
    <span><b>{article.name}</b><small>{article.id} · {article.category}</small></span><strong>{currency(article.price)}</strong>
  </label>;
}

function CityOptions() {
  return <datalist id="customer-cities">{["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala", "Sheikhupura", "Gujrat", "Bahawalpur", "Sargodha", "Hyderabad"].map((city) => <option value={city} key={city} />)}</datalist>;
}

function ArticleForm({ article, initialCategory, onSubmit, onCancel, onSaved, onDelete, isAdmin = true }) {
  const [category, setCategory] = useState(article?.category || initialCategory || "");
  const [photo, setPhoto] = useState(article?.photo || "");
  const [priceMin, setPriceMin] = useState(String(article?.priceMin ?? article?.price ?? ""));
  const submit = (event) => {
    const savedArticle = onSubmit(event, article?.id || null);
    if (savedArticle && !article) onSaved?.(savedArticle);
  };
  return <form className="form-grid" onSubmit={submit}>
    <Field label="Article name *"><input name="name" defaultValue={article?.name || ""} placeholder="e.g. Rose Gold Bridal Lehnga" required /></Field>
    <Field label="Category *"><select name="category" required value={category} onChange={(event) => setCategory(event.target.value)}><option value="" disabled>Select category</option>{categoriesForArticles(article ? [article] : []).map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}</select></Field>
    <Field label="Suggested rental minimum (PKR) *"><input name="priceMin" type="number" min="0" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} placeholder="3000" required /></Field>
    <Field label="Minimum order price (PKR) *"><input name="minOrder" type="number" min="0" defaultValue={article?.minOrder ?? ""} placeholder="20000" required /></Field>
    <PhotoUpload value={photo} onChange={setPhoto} />
    <input className="form-hidden" type="hidden" name="photoData" value={photo} readOnly />
    <input className="form-hidden" type="hidden" name="color" value={article?.color || "rose"} readOnly />
    <div className="modal-actions">{article && <Button variant="danger" type="button" icon={Trash2} onClick={() => onDelete(article)}>{isAdmin ? "Delete article" : "Request deletion"}</Button>}<Button variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" icon={article ? Check : Plus}>{article ? isAdmin ? "Save article" : "Request changes" : "Add article"}</Button></div>
  </form>;
}

function SplashScreen() {
  return <main className="splash-screen"><div className="splash-halo" /><div className="splash-content">
    <div className="splash-mark"><span>DR</span><i>✦</i></div>
    <p className="splash-overline">WELCOME TO</p><h1>Dulhan Rani</h1><p className="splash-subtitle">BOUTIQUE MANAGEMENT</p>
    <div className="splash-loader"><span /></div>
  </div><span className="splash-copyright">BOUTIQUE MANAGEMENT</span></main>;
}
