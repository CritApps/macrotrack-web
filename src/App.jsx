import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ReferenceLine,
  ComposedChart, Scatter, Cell
} from 'recharts';
import { 
  Activity, Scale, Calendar, AlertCircle, 
  TrendingUp, X, LogOut, Flame, PieChart as MacroIcon, Target, CheckCircle, AlertTriangle, QrCode
} from 'lucide-react';
import QRCode from "react-qr-code";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyAgPz9CmmjWsaG8ZBeANDKd5mzi4GrQG-Y",
  authDomain: "macrotrack-88fd0.firebaseapp.com",
  projectId: "macrotrack-88fd0",
  storageBucket: "macrotrack-88fd0.firebasestorage.app",
  messagingSenderId: "302292726081",
  appId: "1:302292726081:web:99ee9bd6499802e5be31c0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CUSTOM COMPONENTS ---
const GoalLine = (props) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return <line x1={cx} y1={cy - 12} x2={cx} y2={cy + 12} stroke="#000" strokeWidth={3} strokeLinecap="round" />;
};

const CustomGoalTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 border border-gray-100 shadow-xl rounded-xl min-w-[150px]">
        <h4 className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-1">{data.name}</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Actual:</span><span className="font-bold text-gray-900">{data.actual}g</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Goal:</span><span className="font-bold text-gray-900">{data.target}g</span></div>
          <div className="mt-2 pt-1 text-right text-xs font-bold text-blue-600">{data.pct}% Achieved</div>
        </div>
      </div>
    );
  }
  return null;
};

function App() {
  const [userId, setUserId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Controls
  const [timeRange, setTimeRange] = useState('30');
  const [chartMode, setChartMode] = useState('calories');
  const [selectedDate, setSelectedDate] = useState(null);
  const [showInspector, setShowInspector] = useState(false);

  // QR Login State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [qrSessionId, setQrSessionId] = useState(null);

  // --- PERSISTENT LOGIN ---
  useEffect(() => {
    const savedId = localStorage.getItem('macro_user_id');
    if (savedId) { setUserId(savedId); fetchData(savedId); }
  }, []);

  // --- QR CODE LOGIN LOGIC ---
  useEffect(() => {
    let unsubscribe;
    if (showLoginModal && !userId) {
      // 1. Generate a random session ID
      const sessionId = Math.random().toString(36).substring(2, 15);
      setQrSessionId(sessionId);

      // 2. Create the session doc in Firestore
      const sessionRef = doc(db, 'login_sessions', sessionId);
      setDoc(sessionRef, { status: 'waiting', created: new Date() });

      // 3. Listen for changes (Mobile app writing the User ID)
      unsubscribe = onSnapshot(sessionRef, (snap) => {
        const data = snap.data();
        if (data && data.userId) {
          // MOBILE SCANNED IT!
          setUserId(data.userId);
          fetchData(data.userId);
          setShowLoginModal(false); // Close modal
        }
      });
    }
    return () => unsubscribe && unsubscribe();
  }, [showLoginModal]);

  const handleLogout = () => {
    localStorage.removeItem('macro_user_id');
    setUserId('');
    setData(null);
  };

  const fetchData = async (idToFetch) => {
    const id = idToFetch || userId;
    if (!id || !id.trim()) return;
    setLoading(true); setError('');
    try {
      const docRef = doc(db, "users", id.trim());
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (!d.history) d.history = [];
        if (!d.weightHistory) d.weightHistory = [];
        if (!d.profile) d.profile = {};
        setData(d);
        localStorage.setItem('macro_user_id', id.trim());
      } else {
        setError("User ID not found.");
        localStorage.removeItem('macro_user_id');
      }
    } catch (e) { setError("Connection Error: " + e.message); }
    setLoading(false);
  };

  // --- DATA ENGINE (Same as before) ---
  const { chartData, weightData, averages, targets, heatmapData, heatmapStats, selectedMeals, macroComparisonData, macroSplit, dailyTotals } = useMemo(() => {
    const defaults = { chartData: [], weightData: [], averages: {}, targets: {}, heatmapData: [], heatmapStats: {total:0, green:0, yellow:0, red:0}, selectedMeals: [], macroComparisonData: [], macroSplit: {}, dailyTotals: {cal:0, p:0, c:0, f:0} };
    if (!data) return defaults;
    const rawMap = {};
    (data.history || []).forEach(item => {
      const d = item.date.includes('T') ? item.date.split('T')[0] : item.date;
      if (!rawMap[d]) rawMap[d] = { date: d, calories: 0, p: 0, c: 0, f: 0 };
      rawMap[d].calories += (Number(item.calories) || 0);
      rawMap[d].p += (Number(item.p) || 0);
      rawMap[d].c += (Number(item.c) || 0);
      rawMap[d].f += (Number(item.f) || 0);
    });
    let processed = Object.values(rawMap).sort((a, b) => new Date(a.date) - new Date(b.date));
    const filterByRange = (arr) => {
      if (timeRange === 'all') return arr;
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return arr.filter(d => new Date(d.date) >= cutoff);
    };
    const filteredHistory = filterByRange(processed);
    let wData = (data.weightHistory || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    wData = wData.map((entry, index, arr) => {
      const start = Math.max(0, index - 6);
      const subset = arr.slice(start, index + 1);
      const avg = subset.reduce((sum, item) => sum + Number(item.weight), 0) / subset.length;
      return { ...entry, movingAvg: parseFloat(avg.toFixed(1)) };
    });
    const filteredWeight = filterByRange(wData);
    const totalDays = filteredHistory.length || 1;
    const avgs = {
      cal: Math.round(filteredHistory.reduce((s, i) => s + i.calories, 0) / totalDays),
      p: Math.round(filteredHistory.reduce((s, i) => s + i.p, 0) / totalDays),
      c: Math.round(filteredHistory.reduce((s, i) => s + i.c, 0) / totalDays),
      f: Math.round(filteredHistory.reduce((s, i) => s + i.f, 0) / totalDays),
      weight: filteredWeight.length > 0 ? filteredWeight[filteredWeight.length - 1].weight : 0
    };
    const p = data.profile || {};
    const goalCal = parseInt(p.dailyGoal) || 2000;
    const t = { 
      cal: goalCal,
      p: Math.round((goalCal * (parseInt(p.targetP) || 40) / 100) / 4),
      c: Math.round((goalCal * (parseInt(p.targetC) || 30) / 100) / 4),
      f: Math.round((goalCal * (parseInt(p.targetF) || 30) / 100) / 9),
    };
    const macroComp = [
      { name: 'Protein', actual: avgs.p, target: t.p, fill: '#EF4444', pct: Math.round((avgs.p/t.p)*100) },
      { name: 'Carbs', actual: avgs.c, target: t.c, fill: '#3B82F6', pct: Math.round((avgs.c/t.c)*100) },
      { name: 'Fat', actual: avgs.f, target: t.f, fill: '#F59E0B', pct: Math.round((avgs.f/t.f)*100) },
    ];
    const totalCalsActual = (avgs.p * 4) + (avgs.c * 4) + (avgs.f * 9) || 1;
    const split = {
      p: Math.round(((avgs.p * 4) / totalCalsActual) * 100),
      c: Math.round(((avgs.c * 4) / totalCalsActual) * 100),
      f: Math.round(((avgs.f * 9) / totalCalsActual) * 100),
    };
    const heatData = [];
    const stats = { total: 0, green: 0, yellow: 0, red: 0 };
    const today = new Date();
    for (let i = 364; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry = rawMap[dateStr];
      let status = 'empty';
      if (entry) {
        stats.total++;
        const ratio = entry.calories / (t.cal || 2000);
        if (ratio > 1.1) { status = 'over'; stats.red++; } else if (ratio < 0.8) { status = 'under'; stats.yellow++; } else { status = 'good'; stats.green++; }
      }
      heatData.push({ date: dateStr, status, calories: entry ? entry.calories : 0 });
    }
    let mealsForDay = [];
    let dTotals = { cal: 0, p: 0, c: 0, f: 0 };
    if (selectedDate && data.history) {
      mealsForDay = data.history.filter(h => h.date && (h.date.startsWith(selectedDate)));
      dTotals = mealsForDay.reduce((acc, curr) => ({
        cal: acc.cal + (Number(curr.calories) || 0),
        p: acc.p + (Number(curr.p) || 0),
        c: acc.c + (Number(curr.c) || 0),
        f: acc.f + (Number(curr.f) || 0),
      }), { cal: 0, p: 0, c: 0, f: 0 });
    }
    return { chartData: filteredHistory, weightData: filteredWeight, averages: avgs, targets: t, heatmapData: heatData, heatmapStats: stats, selectedMeals: mealsForDay, macroComparisonData: macroComp, macroSplit: split, dailyTotals: dTotals };
  }, [data, timeRange, selectedDate]);

  const onChartClick = (e) => { if (e && e.activePayload && e.activePayload.length > 0) { setSelectedDate(e.activePayload[0].payload.date); setShowInspector(true); } };
  const onHeatmapClick = (date) => { setSelectedDate(date); setShowInspector(true); };

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans text-gray-800 bg-gray-50 flex flex-col relative overflow-hidden">
      
      {/* HEADER */}
      <header className="max-w-7xl mx-auto w-full mb-8 bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg"><Activity className="text-white" size={24} /></div>
          <div><h1 className="text-xl font-bold text-gray-900">MacroTrack</h1><p className="text-gray-500 text-xs">Analytics Console</p></div>
        </div>
        {!data ? (
          <div className="flex gap-2">
            <button 
              onClick={() => setShowLoginModal(true)} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-md transition-all"
            >
              <QrCode size={18} /> Connect Device
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="flex items-center gap-2 text-gray-500 hover:text-red-500 text-sm font-medium"><LogOut size={16} /> Logout</button>
        )}
      </header>

      {/* ERROR */}
      {error && <div className="max-w-7xl mx-auto mb-6 bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 border border-red-100"><AlertCircle size={20} /> {error}</div>}

      {/* DASHBOARD CONTENT */}
      {data ? (
        <div className="max-w-7xl mx-auto w-full space-y-6 pb-20">
          
          {/* CONTROLS */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex bg-gray-50 p-1 rounded-lg">
              {['7', '30', '90', 'all'].map(r => (
                <button key={r} onClick={() => setTimeRange(r)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${timeRange === r ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>{r === 'all' ? 'All' : `${r}D`}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setChartMode('calories')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${chartMode === 'calories' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-transparent'}`}><Flame size={16}/> Calories</button>
              <button onClick={() => setChartMode('macros')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${chartMode === 'macros' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-transparent'}`}><MacroIcon size={16}/> Macros</button>
              <button onClick={() => setChartMode('weight')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${chartMode === 'weight' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-transparent'}`}><Scale size={16}/> Weight</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* MAIN CHART */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-96 relative">
              <h2 className="text-lg font-bold mb-4 text-gray-800 capitalize flex items-center gap-2">
                <TrendingUp size={20} className="text-gray-400"/> {chartMode} Trend
                <span className="text-xs font-normal text-gray-400 ml-auto bg-gray-50 px-2 py-1 rounded">Click bars for details</span>
              </h2>
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'calories' ? (
                  <AreaChart data={chartData} onClick={onChartClick} className="cursor-pointer">
                    <defs><linearGradient id="colorCal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/><stop offset="95%" stopColor="#2563EB" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                    <XAxis dataKey="date" tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} tick={{fill:'#9CA3AF',fontSize:12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#F3F4F6'}} contentStyle={{borderRadius:'12px'}} />
                    <ReferenceLine y={targets.cal} stroke="#EF4444" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="calories" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorCal)" activeDot={{r:6, onClick: onChartClick}} />
                  </AreaChart>
                ) : chartMode === 'macros' ? (
                  <BarChart data={chartData} onClick={onChartClick} className="cursor-pointer">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                    <XAxis dataKey="date" tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} tick={{fill:'#9CA3AF',fontSize:12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: '#F3F4F6'}} contentStyle={{borderRadius:'12px'}} />
                    <Legend />
                    <Bar dataKey="p" name="Protein" stackId="a" fill="#EF4444" onClick={onChartClick} />
                    <Bar dataKey="c" name="Carbs" stackId="a" fill="#3B82F6" onClick={onChartClick} />
                    <Bar dataKey="f" name="Fat" stackId="a" fill="#F59E0B" onClick={onChartClick} />
                  </BarChart>
                ) : (
                  <LineChart data={weightData} onClick={onChartClick} className="cursor-pointer">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                    <XAxis dataKey="date" tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} tick={{fill:'#9CA3AF',fontSize:12}} dy={10} />
                    <YAxis domain={['dataMin - 2', 'dataMax + 2']} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{borderRadius:'12px'}} />
                    <Legend />
                    <Line name="Weight" type="monotone" dataKey="weight" stroke="#C084FC" strokeWidth={2} dot={{r:3, onClick: onChartClick}} activeDot={{r:5, onClick: onChartClick}} />
                    <Line name="7-Day Avg" type="monotone" dataKey="movingAvg" stroke="#7C3AED" strokeWidth={3} dot={false} strokeDasharray="5 5" />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* SIDEBAR */}
            <div className="space-y-6">
              
              {/* GOAL vs ACTUAL CHART */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-sm font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                  <Target size={16} /> Avg vs Goal (Daily)
                </h3>
                
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart layout="vertical" data={macroComparisonData} margin={{top:0, right:0, left:0, bottom:0}}>
                      <XAxis type="number" hide />
                      <YAxis yAxisId="left" dataKey="name" type="category" width={50} tick={{fontSize: 12, fontWeight: 600}} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" dataKey="name" type="category" width={90} tickFormatter={(val, index) => { const item = macroComparisonData[index]; return item ? `${item.pct}% of Goal` : val; }} tick={{fontSize: 11, fontWeight: 600, fill: '#666'}} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: 'transparent'}} content={<CustomGoalTooltip />} />
                      <Bar dataKey="actual" barSize={24} radius={[0,4,4,0]} yAxisId="left">
                        {macroComparisonData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Bar>
                      <Scatter dataKey="target" shape={<GoalLine />} yAxisId="left" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-center text-gray-400 mb-2 font-medium uppercase tracking-wide">Actual Caloric Split</p>
                  <div className="flex justify-center gap-3 text-xs font-bold text-gray-600">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"/> Prot {macroSplit.p}%</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"/> Carb {macroSplit.c}%</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500"/> Fat {macroSplit.f}%</span>
                  </div>
                </div>
              </div>

              {/* Weight Card */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                  <p className="text-gray-500 text-xs font-bold uppercase">Current Weight</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-3xl font-extrabold text-gray-900">{averages.weight}</h3>
                    <span className="text-sm text-gray-500">lbs</span>
                  </div>
                </div>
                <div className="bg-purple-100 p-3 rounded-full"><Scale className="text-purple-600" size={24}/></div>
              </div>
            </div>
          </div>

          {/* HEATMAP + STATS */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
               <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Calendar size={20} className="text-green-600"/> Consistency Map (Last Year)</h2>
               
               {/* STATS SUMMARY ROW */}
               <div className="flex gap-4 text-xs font-medium">
                 <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                   <Activity size={12} className="text-gray-400"/> {heatmapStats.total} Logged
                 </div>
                 <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg border border-green-100 text-green-700">
                   <CheckCircle size={12}/> {heatmapStats.green} On Track
                 </div>
                 <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-100 text-yellow-700">
                   <AlertCircle size={12}/> {heatmapStats.yellow} Under
                 </div>
                 <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg border border-red-100 text-red-700">
                   <AlertTriangle size={12}/> {heatmapStats.red} Over
                 </div>
               </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {heatmapData.map((day, i) => (
                <div 
                  key={i} 
                  title={`${day.date}: ${day.calories} kcal`} 
                  onClick={() => onHeatmapClick(day.date)}
                  className={`w-3 h-3 rounded-sm cursor-pointer hover:opacity-80 transition-all ${day.status === 'empty' ? 'bg-gray-100' : day.status === 'good' ? 'bg-green-500' : day.status === 'under' ? 'bg-yellow-400' : 'bg-red-400'}`} 
                />
              ))}
            </div>

            {/* LEGEND */}
            <div className="flex justify-end gap-4 mt-4 text-xs text-gray-500 font-medium">
               <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-gray-100"/> Empty</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-green-500"/> On Track</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-yellow-400"/> Under</div>
               <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-400"/> Over</div>
            </div>
          </div>
        </div>
      ) : (
        /* LOGIN MODAL OR EMPTY STATE */
        <div className="flex flex-col items-center justify-center h-96">
          {showLoginModal ? (
             <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center animate-in fade-in zoom-in duration-200">
               <h3 className="text-xl font-bold mb-2 text-gray-800">Scan to Connect</h3>
               <p className="text-gray-500 text-sm mb-6 text-center max-w-xs">Open the MacroTrack app on your phone, go to Settings, and tap <strong>Connect to Web Dashboard</strong>.</p>
               
               <div className="p-4 bg-white border-4 border-indigo-100 rounded-xl mb-6">
                 <QRCode value={qrSessionId || "loading"} size={180} />
               </div>

               <button onClick={() => setShowLoginModal(false)} className="text-gray-400 text-sm hover:text-gray-600">Cancel</button>
             </div>
          ) : (
            <div className="text-center">
              <Activity size={64} className="mx-auto mb-4 text-gray-200" />
              <h2 className="text-2xl font-bold text-gray-300">Welcome to MacroTrack</h2>
              <p className="text-gray-400">Click "Connect Device" to view your data.</p>
            </div>
          )}
        </div>
      )}

      {/* INSPECTOR DRAWER */}
      {showInspector && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowInspector(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl h-full p-6 overflow-y-auto animate-slide-in flex flex-col">
            <div className="flex-none">
              <button onClick={() => setShowInspector(false)} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20} /></button>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{selectedDate ? new Date(selectedDate).toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'}) : 'Log Details'}</h2>
              <p className="text-gray-500 mb-6">Daily Log Breakdown</p>
            </div>
            
            <div className="flex-grow overflow-y-auto space-y-4 pr-2">
              {selectedMeals.length > 0 ? (
                selectedMeals.map((meal, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="flex justify-between items-start mb-2"><h3 className="font-bold text-gray-800">{meal.name || 'Meal'}</h3><span className="font-bold text-blue-600">{Math.round(meal.calories)} cal</span></div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 text-center"><div className="bg-white p-1 rounded border">P: {meal.p}g</div><div className="bg-white p-1 rounded border">C: {meal.c}g</div><div className="bg-white p-1 rounded border">F: {meal.f}g</div></div>
                    {meal.date.includes('T') && <div className="mt-2 text-right text-xs text-gray-400">{new Date(meal.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>}
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-400 mt-10">
                  <AlertCircle size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No meals logged for this date.</p>
                </div>
              )}
            </div>

            {/* NEW: FOOTER WITH MACRO TOTALS */}
            {selectedMeals.length > 0 && (
              <div className="flex-none mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-500 font-bold">Total Daily Intake</span>
                  <div className="text-right">
                    <span className="block text-2xl font-extrabold text-gray-900">{Math.round(dailyTotals.cal)} <span className="text-sm text-gray-500 font-normal">kcal</span></span>
                    <span className="text-xs text-gray-400">Goal: {targets.cal}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                    <span className="block text-xl font-bold text-red-600">
                      {Math.round(dailyTotals.p)} <span className="text-sm font-normal text-red-400">/ {targets.p}g</span>
                    </span>
                    <span className="text-xs text-red-400 uppercase font-bold">Protein</span>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                    <span className="block text-xl font-bold text-blue-600">
                      {Math.round(dailyTotals.c)} <span className="text-sm font-normal text-blue-400">/ {targets.c}g</span>
                    </span>
                    <span className="text-xs text-blue-400 uppercase font-bold">Carbs</span>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-center">
                    <span className="block text-xl font-bold text-yellow-600">
                      {Math.round(dailyTotals.f)} <span className="text-sm font-normal text-yellow-400">/ {targets.f}g</span>
                    </span>
                    <span className="text-xs text-yellow-400 uppercase font-bold">Fat</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;