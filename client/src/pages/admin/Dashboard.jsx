import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Layout from '../../components/Layout';
import { Users, IndianRupee, CreditCard, TrendingUp, Download, History, CheckCircle, Archive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const AdminDashboard = () => {
    const [stats, setStats] = useState({
        totalEmployees: 0,
        totalThrift: 0,
        activeLoans: 0,
        monthlySummary: {}
    });

    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
    const [balanceFrom, setBalanceFrom] = useState('');
    const [balanceTo, setBalanceTo] = useState('');

    const [downloading, setDownloading] = useState(false);
    const [downloadingMonth, setDownloadingMonth] = useState(null); // which month row is downloading
    const [downloadingBalanceSheet, setDownloadingBalanceSheet] = useState(false);

    const [monthlyHistory, setMonthlyHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const { data } = await api.get('/admin/dashboard');
                setStats(data);
            } catch (error) {
                console.error('Failed to fetch stats', error);
            }
        };
        const fetchHistory = async () => {
            try {
                const { data } = await api.get('/admin/reports/monthly-history');
                setMonthlyHistory(data);
            } catch (error) {
                console.error('Failed to fetch monthly history', error);
            } finally {
                setLoadingHistory(false);
            }
        };
        fetchStats();
        fetchHistory();
    }, []);

    const handleDownloadMonthlyReport = async (month, isArchived = false) => {
        const targetMonth = month || selectedMonth;
        if (!targetMonth) {
            toast.error('Please select a month');
            return;
        }

        if (month) {
            setDownloadingMonth(month);
        } else {
            setDownloading(true);
        }
        try {
            // Use archived endpoint for archived months, live endpoint for live months
            const endpoint = isArchived
                ? `/admin/reports/archived/${targetMonth}`
                : `/admin/reports/monthly/${targetMonth}`;
            const response = await api.get(endpoint, {
                responseType: 'blob'
            });

            // Create a download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const prefix = isArchived ? 'Archived_Report' : 'Monthly_Report';
            link.setAttribute('download', `${prefix}_${targetMonth}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.success(`${isArchived ? 'Archived' : 'Monthly'} report downloaded!`);
        } catch (error) {
            console.error('Failed to download report', error);
            // Handle blob error responses
            if (error.response?.data instanceof Blob) {
                const text = await error.response.data.text();
                try { toast.error(JSON.parse(text).message); } catch { toast.error(text || 'Failed to download report'); }
            } else {
                toast.error(error.response?.data?.message || 'Failed to download report');
            }
        } finally {
            if (month) {
                setDownloadingMonth(null);
            } else {
                setDownloading(false);
            }
        }
    };

    const handleDownloadYearlyReport = async () => {
        if (!selectedYear) {
            toast.error('Please select a year');
            return;
        }

        setDownloading(true);
        try {
            const response = await api.get(`/admin/reports/yearly/${selectedYear}`, {
                responseType: 'blob'
            });

            // Create a download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Yearly_Report_${selectedYear}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.success('Yearly report downloaded successfully!');
        } catch (error) {
            console.error('Failed to download yearly report', error);
            if (error.response?.data instanceof Blob) {
                const text = await error.response.data.text();
                try { toast.error(JSON.parse(text).message); } catch { toast.error(text || 'Failed to download yearly report'); }
            } else {
                toast.error(error.response?.data?.message || 'Failed to download yearly report');
            }
        } finally {
            setDownloading(false);
        }
    };

    const handleDownloadBalanceSheet = async () => {
        setDownloadingBalanceSheet(true);
        try {
            const params = new URLSearchParams();
            if (balanceFrom) params.append('from', balanceFrom);
            if (balanceTo) params.append('to', balanceTo);

            const response = await api.get(`/admin/reports/balance-sheet${params.toString() ? `?${params.toString()}` : ''}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Balance_Sheet.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.success('Balance sheet downloaded successfully!');
        } catch (error) {
            console.error('Failed to download balance sheet', error);
            if (error.response?.data instanceof Blob) {
                const text = await error.response.data.text();
                try { toast.error(JSON.parse(text).message); } catch { toast.error(text || 'Failed to download balance sheet'); }
            } else {
                toast.error(error.response?.data?.message || 'Failed to download balance sheet');
            }
        } finally {
            setDownloadingBalanceSheet(false);
        }
    };

    const cards = [
        { title: 'Total Employees', value: stats.totalEmployees, icon: Users, color: 'bg-blue-600' },
        { title: 'Thrift Balance', value: `₹${stats.totalThrift.toLocaleString()}`, icon: IndianRupee, color: 'bg-green-600' },
        { title: 'Active Loans', value: stats.activeLoans, icon: CreditCard, color: 'bg-purple-600' },
        { title: 'Monthly Deductions', value: `₹${((stats.monthlySummary?.totalThrift || 0) + (stats.monthlySummary?.totalEMI || 0)).toLocaleString()}`, icon: TrendingUp, color: 'bg-orange-600' }
    ];

    return (
        <Layout>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Admin Dashboard</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Overview of society operations</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {cards.map((card, index) => (
                    <div key={index} className="card flex items-center p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm transition-colors duration-200">
                        <div className={`p-4 rounded-full ${card.color} bg-opacity-20 mr-4`}>
                            <card.icon size={24} className={`${card.color.replace('bg-', 'text-')}`} />
                        </div>
                        <div>
                            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{card.title}</p>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{card.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* Download Reports Section */}
            <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8 transition-colors duration-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Download Reports</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Generate and download financial reports</p>
                    </div>
                    <Download className="text-indigo-600 dark:text-indigo-400" size={24} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Monthly Report */}
                    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Monthly Report</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                            Employee-wise salary, thrift, and deduction details for a specific month
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                                onClick={() => handleDownloadMonthlyReport()}
                                disabled={downloading}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Download size={16} />
                                {downloading ? 'Downloading...' : 'Download'}
                            </button>
                        </div>
                    </div>

                    {/* Yearly Report */}
                    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Yearly Report</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                            Annual summary of all employees with total deductions and thrift balances
                        </p>
                        <div className="flex gap-2">
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleDownloadYearlyReport}
                                disabled={downloading}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Download size={16} />
                                {downloading ? 'Downloading...' : 'Download'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-6 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Balance Sheet (Month-wise)</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Downloads month-wise balance sheet with dates. The <strong>intrest</strong> column is auto-calculated from monthly uploaded transaction data.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                            type="month"
                            value={balanceFrom}
                            onChange={(e) => setBalanceFrom(e.target.value)}
                            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="From month"
                        />
                        <input
                            type="month"
                            value={balanceTo}
                            onChange={(e) => setBalanceTo(e.target.value)}
                            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="To month"
                        />
                        <button
                            onClick={handleDownloadBalanceSheet}
                            disabled={downloadingBalanceSheet}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            {downloadingBalanceSheet ? 'Downloading...' : 'Download Balance Sheet'}
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                        Leave date range empty to export all available months.
                    </p>
                </div>
            </div>

            {/* Monthly Data History */}
            <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8 transition-colors duration-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Monthly Data History</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            All uploaded monthly data is preserved — download any month anytime
                        </p>
                    </div>
                    <History className="text-green-600 dark:text-green-400" size={24} />
                </div>

                {loadingHistory ? (
                    <p className="text-slate-500 dark:text-slate-400 text-sm py-4 text-center">Loading history...</p>
                ) : monthlyHistory.length === 0 ? (
                    <p className="text-slate-500 dark:text-slate-400 text-sm py-4 text-center">No monthly data uploads found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase">
                                    <th className="pb-3 pr-4">Month</th>
                                    <th className="pb-3 pr-4 text-right">Employees</th>
                                    <th className="pb-3 pr-4 text-right">Total Thrift</th>
                                    <th className="pb-3 pr-4 text-right">Total EMI</th>
                                    <th className="pb-3 pr-4 text-right">Total Deduction</th>
                                    <th className="pb-3 text-center">Status</th>
                                    <th className="pb-3 text-right">Download</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {monthlyHistory.map((row) => {
                                    const [yr, mo] = row.month.split('-');
                                    const displayMonth = new Date(Number(yr), Number(mo) - 1, 1)
                                        .toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
                                    const isArchived = row.dataStatus === 'archived';
                                    return (
                                        <tr key={row.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="py-3 pr-4">
                                                <p className="font-medium text-slate-800 dark:text-slate-100">{displayMonth}</p>
                                                {isArchived && row.uploadedOn && (
                                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                                        Archived {new Date(row.uploadedOn).toLocaleDateString('en-IN')}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-slate-600 dark:text-slate-300">{row.employeeCount}</td>
                                            <td className="py-3 pr-4 text-right text-slate-600 dark:text-slate-300">₹{row.totalThrift.toLocaleString()}</td>
                                            <td className="py-3 pr-4 text-right text-slate-600 dark:text-slate-300">₹{row.totalEMI.toLocaleString()}</td>
                                            <td className="py-3 pr-4 text-right text-slate-600 dark:text-slate-300">₹{row.totalDeduction.toLocaleString()}</td>
                                            <td className="py-3 text-center">
                                                {isArchived ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
                                                        <Archive size={12} /> Archived
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                                                        <CheckCircle size={12} /> Live
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 text-right">
                                                <button
                                                    onClick={() => handleDownloadMonthlyReport(row.month, isArchived)}
                                                    disabled={downloadingMonth === row.month}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-lg text-xs font-medium transition-colors"
                                                >
                                                    <Download size={13} />
                                                    {downloadingMonth === row.month ? 'Downloading...' : 'Download'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-colors duration-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Financial Overview</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height={256}>
                            <BarChart data={[
                                { name: 'Thrift', value: stats.totalThrift },
                                { name: 'Loans', value: stats.monthlySummary?.totalEMI * 12 || 0 } // Estimate
                            ]}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="name" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', border: 'none' }}
                                    itemStyle={{ color: '#f8fafc' }}
                                />
                                <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-colors duration-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Recent Activity</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">No recent logs found.</p>
                </div>
            </div>
        </Layout>
    );
};

export default AdminDashboard;
