import { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import api from '../../api/axios';
import Layout from '../../components/Layout';
import { 
    IndianRupee, 
    PiggyBank, 
    CreditCard, 
    TrendingDown, 
    User, 
    Clock,
    Shield,
    ArrowRight,
    Eye,
    EyeOff,
    Edit2,
    X,
    Mail,
    Phone,
    Download
} from 'lucide-react';
import toast from 'react-hot-toast';

// Safely format a value that may be "YYYY-MM" or a full ISO date string
const formatMonthDisplay = (val) => {
    if (!val) return '—';
    const s = String(val);
    if (/^\d{4}-\d{2}$/.test(s)) {
        return new Date(s + '-01').toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
};

const EmployeeDashboard = () => {
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        email: '',
        phone: '',
        panNumber: '',
        aadhaarNumber: ''
    });
    const [saving, setSaving] = useState(false);
    const { user } = useContext(AuthContext);

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const { data } = await api.get('/employee/dashboard');
            setDashboard(data);
            setEditForm({
                email: data.email || '',
                phone: data.phone || '',
                panNumber: data.panNumber || '',
                aadhaarNumber: data.aadhaarNumber || ''
            });
        } catch (error) {
            toast.error('Failed to fetch dashboard');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-64">
                    <div className="text-slate-400">Loading dashboard...</div>
                </div>
            </Layout>
        );
    }

    if (!dashboard) {
        return (
            <Layout>
                <div className="text-red-400">Dashboard not available. Contact Admin.</div>
            </Layout>
        );
    }

    return (
        <Layout>
            {/* Header */}
            <div className="mb-8">
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider">
                    Employee Dashboard
                </p>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                            Welcome, {dashboard.employeeName
                                ? dashboard.employeeName.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s*/i, '').trim()
                                : 'Employee'}
                        </h1>
                        {dashboard.empId && (
                            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                                Employee ID: <span className="font-semibold text-slate-700 dark:text-slate-300">{dashboard.empId}</span>
                                {dashboard.department && (
                                    <span className="ml-3 text-slate-500 dark:text-slate-400">· {dashboard.department}</span>
                                )}
                            </p>
                        )}
                    </div>
                    <button 
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-lg transition-colors border border-indigo-100 dark:border-indigo-800"
                    >
                        <Edit2 size={16} />
                        <span className="font-medium text-sm">Edit Profile</span>
                    </button>
                </div>
            </div>

            {/* Profile Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8 flex flex-col md:flex-row gap-8 items-center">
                <div className="p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
                    <User size={40} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Credit Score</p>
                    <p className={`text-lg font-bold ${
                        (dashboard.creditScore || 750) >= 750 ? 'text-green-600' : 
                        (dashboard.creditScore || 750) >= 600 ? 'text-yellow-600' : 'text-red-500'
                    }`}>
                        {dashboard.creditScore || 750} / 900
                    </p>
                </div>
            </div>

            {/* Quick Summary Panel */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 mb-8 text-white">
                <h2 className="text-xl font-bold mb-4">Quick Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <p className="text-blue-100 text-sm">Total Saved in Society</p>
                        <p className="text-3xl font-bold">₹{dashboard.summary.totalSaved.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-blue-100 text-sm">Total Loan Taken</p>
                        <p className="text-3xl font-bold">₹{dashboard.summary.totalLoanTaken.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-blue-100 text-sm">Remaining Loan</p>
                        <p className="text-3xl font-bold">₹{dashboard.summary.remainingLoan.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Salary Card */}
                <div className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-green-600 bg-opacity-20 rounded-lg">
                            <IndianRupee className="text-green-500" size={24} />
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-600">
                            {formatMonthDisplay(dashboard.salary.lastUpdated)}
                        </span>
                    </div>
                    <h3 className="text-slate-400 dark:text-slate-600 text-sm font-medium mb-2">Salary</h3>
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-600 text-xs">Gross</span>
                            <span className="text-slate-300 dark:text-slate-700 text-sm font-semibold">
                                ₹{dashboard.salary.gross.toLocaleString()}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-600 text-xs">Net</span>
                            <span className="text-white dark:text-slate-900 text-lg font-bold">
                                ₹{dashboard.salary.net.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Thrift Card */}
                <div className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-600 bg-opacity-20 rounded-lg">
                            <PiggyBank className="text-blue-500" size={24} />
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-600">
                            {formatMonthDisplay(dashboard.thrift.lastContribution)}
                        </span>
                    </div>
                    <h3 className="text-slate-400 dark:text-slate-600 text-sm font-medium mb-2">Thrift</h3>
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-600 text-xs">Monthly</span>
                            <span className="text-slate-300 dark:text-slate-700 text-sm font-semibold">
                                ₹{dashboard.thrift.monthlyContribution.toLocaleString()}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-600 text-xs">Total Balance</span>
                            <span className="text-white dark:text-slate-900 text-lg font-bold">
                                ₹{dashboard.thrift.totalBalance.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Loan Card */}
                <div className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-600 bg-opacity-20 rounded-lg">
                            <CreditCard className="text-purple-500" size={24} />
                        </div>
                        {dashboard.loan && (
                            <span className={`text-xs px-2 py-1 rounded font-semibold ${
                                dashboard.loan.status === 'active' 
                                    ? 'bg-green-600 text-white' 
                                    : 'bg-slate-600 text-white'
                            }`}>
                                {dashboard.loan.status.toUpperCase()}
                            </span>
                        )}
                    </div>
                    <h3 className="text-slate-400 dark:text-slate-600 text-sm font-medium mb-2">Loan</h3>
                    {dashboard.loan ? (
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-600 text-xs">EMI</span>
                                <span className="text-slate-300 dark:text-slate-700 text-sm font-semibold">
                                    ₹{dashboard.loan.emi.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-600 text-xs">Balance</span>
                                <span className="text-white dark:text-slate-900 text-lg font-bold">
                                    ₹{dashboard.loan.balance.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-slate-400 dark:text-slate-500 text-sm">No active loan</p>
                    )}
                </div>

                {/* Deduction Card */}
                <div className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-orange-600 bg-opacity-20 rounded-lg">
                            <TrendingDown className="text-orange-500" size={24} />
                        </div>
                    </div>
                    <h3 className="text-slate-400 dark:text-slate-600 text-sm font-medium mb-2">Deductions</h3>
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-600">Thrift</span>
                            <span className="text-slate-300 dark:text-slate-700">₹{dashboard.deductions.thrift.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-600">Loan EMI</span>
                            <span className="text-slate-300 dark:text-slate-700">₹{dashboard.deductions.loanEmi.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-600">Interest</span>
                            <span className="text-slate-300 dark:text-slate-700">₹{dashboard.deductions.interest.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-slate-700 dark:border-slate-200">
                            <span className="text-slate-500 dark:text-slate-600 text-xs font-semibold">Total</span>
                            <span className="text-white dark:text-slate-900 text-lg font-bold">
                                ₹{dashboard.deductions.total.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Application Forms */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Application Forms</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            View or download the membership and loan application PDFs.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a
                        href="/MEMBERESHIP.pdf"
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="group flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-400 hover:shadow-sm transition-all"
                    >
                        <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">Membership Application Form</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Open and download the membership form PDF.</p>
                        </div>
                        <Download size={18} className="text-indigo-600 dark:text-indigo-400 group-hover:translate-y-0.5 transition-transform" />
                    </a>

                    <a
                        href="/APPLICATION FOR LOAN Non-Teaching.pdf"
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="group flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-400 hover:shadow-sm transition-all"
                    >
                        <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">Loan Application Form</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Open and download the loan form PDF.</p>
                        </div>
                        <Download size={18} className="text-indigo-600 dark:text-indigo-400 group-hover:translate-y-0.5 transition-transform" />
                    </a>
                </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link 
                    to="/employee/transactions"
                    className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200 hover:border-blue-500 transition-colors group"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-slate-100 dark:text-slate-900 font-semibold mb-1">Transaction History</h4>
                            <p className="text-slate-400 dark:text-slate-600 text-sm">View monthly deductions</p>
                        </div>
                        <ArrowRight className="text-blue-500 group-hover:translate-x-1 transition-transform" size={20} />
                    </div>
                </Link>

                <Link 
                    to="/employee/loan"
                    className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200 hover:border-blue-500 transition-colors group"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-slate-100 dark:text-slate-900 font-semibold mb-1">Loan Details</h4>
                            <p className="text-slate-400 dark:text-slate-600 text-sm">View loan information</p>
                        </div>
                        <ArrowRight className="text-blue-500 group-hover:translate-x-1 transition-transform" size={20} />
                    </div>
                </Link>

                <Link 
                    to="/employee/sureties"
                    className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200 hover:border-blue-500 transition-colors group"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-slate-100 dark:text-slate-900 font-semibold mb-1">Surety View</h4>
                            <p className="text-slate-400 dark:text-slate-600 text-sm">View guarantor details</p>
                        </div>
                        <ArrowRight className="text-blue-500 group-hover:translate-x-1 transition-transform" size={20} />
                    </div>
                </Link>
            </div>

            {/* Surety Responsibility Card */}
            {dashboard.suretyResponsibilities && dashboard.suretyResponsibilities.length > 0 && (
                <div className="bg-slate-800 dark:bg-white rounded-xl p-6 border border-slate-700 dark:border-slate-200 mt-8">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-600 bg-opacity-20 rounded-lg">
                                <Shield className="text-yellow-500" size={20} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-100 dark:text-slate-900">Surety Responsibilities</h3>
                        </div>
                        <Link 
                            to="/employee/sureties"
                            className="text-blue-500 hover:text-blue-400 text-sm flex items-center gap-1"
                        >
                            View All <ArrowRight size={16} />
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {dashboard.suretyResponsibilities.map((surety, index) => (
                            <div 
                                key={index} 
                                className="flex justify-between items-center p-4 bg-slate-700 dark:bg-slate-50 rounded-lg"
                            >
                                <div>
                                    <p className="font-semibold text-slate-100 dark:text-slate-900">{surety.borrowerName}</p>
                                    <p className="text-sm text-slate-400 dark:text-slate-600">{surety.borrowerDepartment}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-slate-100 dark:text-slate-900">
                                        ₹{surety.balance.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-600">Balance</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Edit Profile Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Edit Profile & Identification</h2>
                            <button onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            setSaving(true);
                            try {
                                await api.put('/employee/update-profile', editForm);
                                toast.success('Profile updated successfully');
                                setShowEditModal(false);
                                fetchDashboard();
                            } catch(err) {
                                toast.error(err.response?.data?.message || 'Failed to update profile');
                            } finally {
                                setSaving(false);
                            }
                        }} className="p-6 space-y-4">
                            
                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Email Address</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                        type="email" required 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-800 dark:text-slate-100" 
                                        value={editForm.email} 
                                        onChange={e => setEditForm({...editForm, email: e.target.value})} 
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Phone Number</label>
                                <div className="relative">
                                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                        type="tel" required 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-800 dark:text-slate-100" 
                                        value={editForm.phone} 
                                        onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">PAN Card Number</label>
                                <div className="relative">
                                    <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                        type="text" required autoCapitalize="characters"
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-800 dark:text-slate-100" 
                                        value={editForm.panNumber} 
                                        onChange={e => setEditForm({...editForm, panNumber: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Aadhaar Card Number</label>
                                <div className="relative">
                                    <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                        type="text" required inputMode="numeric"
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-2 pl-10 pr-4 text-slate-800 dark:text-slate-100" 
                                        value={editForm.aadhaarNumber} 
                                        onChange={e => setEditForm({...editForm, aadhaarNumber: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 mt-6 border-t border-slate-200 dark:border-slate-800">
                                <button type="button" disabled={saving} onClick={() => setShowEditModal(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                                    Cancel
                                </button>
                                <button type="submit" disabled={saving} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </Layout>
    );
};

export default EmployeeDashboard;
