import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Layout from '../../components/Layout';
import { User, IndianRupee, CreditCard, Activity, Save, X, Edit, Trash, Plus, History, TrendingUp, Calendar, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'react-hot-toast';

const EmployeeDetailsEnhanced = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    // Adjustment states
    const [showAdjustmentPanel, setShowAdjustmentPanel] = useState(false);
    const [adjustmentType, setAdjustmentType] = useState('');
    const [adjustmentData, setAdjustmentData] = useState({});
    
    // History data
    const [history, setHistory] = useState([]);
    const [transactions, setTransactions] = useState([]);

    // Report download states
    const [reportMonth, setReportMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [reportYear, setReportYear] = useState(() => new Date().getFullYear().toString());
    const [downloadingReport, setDownloadingReport] = useState(false);

    // State for editable fields
    const [formData, setFormData] = useState({});

    useEffect(() => {
        fetchEmployee();
        fetchHistory();
        fetchTransactions();
    }, [id]);

    const fetchEmployee = async () => {
        try {
            const { data } = await api.get(`/admin/employees/${id}`);
            setEmployee(data);
            setFormData(data);
        } catch (error) {
            toast.error('Failed to fetch employee details');
            navigate('/admin/employees');
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const { data } = await api.get(`/admin/employees/${id}/history`);
            setHistory(data);
        } catch (error) {
            console.error('Failed to fetch history', error);
        }
    };

    const fetchTransactions = async () => {
        try {
            const { data } = await api.get(`/admin/employees/${id}/transactions`);
            setTransactions(data);
        } catch (error) {
            console.error('Failed to fetch transactions', error);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        try {
            await api.put(`/admin/employees/${id}`, formData);
            setEmployee(formData);
            setEditMode(false);
            toast.success('Employee updated successfully');
            fetchHistory(); // Refresh history
        } catch (error) {
            toast.error('Failed to update employee');
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this employee?')) {
            try {
                await api.delete(`/admin/employees/${id}`);
                toast.success('Employee deleted');
                navigate('/admin/employees');
            } catch (error) {
                toast.error('Failed to delete employee');
            }
        }
    };

    const handleMarkInactive = async () => {
        if (employee?.isActive === false) {
            toast('Employee is already inactive', { icon: 'ℹ️' });
            return;
        }

        const currentBalance = Number(employee?.thriftBalance || 0);
        const amountInput = window.prompt(
            `Enter thrift payout amount to settle (max ₹${currentBalance.toLocaleString()}).\nLeave as ${currentBalance} to settle full balance:`,
            String(currentBalance)
        );

        if (amountInput === null) return;

        const settlementAmount = Number(amountInput);
        if (Number.isNaN(settlementAmount) || settlementAmount < 0) {
            toast.error('Enter a valid settlement amount');
            return;
        }

        if (!window.confirm(`Mark this employee inactive and settle ₹${settlementAmount.toLocaleString()} from thrift balance?`)) {
            return;
        }

        try {
            await api.post(`/admin/employees/${id}/mark-inactive`, {
                settlementAmount,
                remarks: 'Employee left organisation'
            });
            toast.success('Employee marked inactive and thrift settled');
            fetchEmployee();
            fetchHistory();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to mark employee inactive');
        }
    };

    const openAdjustmentPanel = (type) => {
        setAdjustmentType(type);
        setAdjustmentData({});
        setShowAdjustmentPanel(true);
    };

    const handleAdjustmentSubmit = async () => {
        try {
            let endpoint = '';
            let payload = adjustmentData;

            switch (adjustmentType) {
                case 'salary':
                    endpoint = `/admin/employees/${id}/adjust-salary`;
                    break;
                case 'thrift':
                    endpoint = `/admin/employees/${id}/adjust-thrift`;
                    break;
                case 'loan':
                    endpoint = `/admin/employees/${id}/adjust-loan`;
                    break;
                default:
                    return;
            }

            await api.post(endpoint, payload);
            toast.success('Adjustment applied successfully');
            setShowAdjustmentPanel(false);
            fetchEmployee();
            fetchHistory();
            fetchTransactions();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to apply adjustment');
        }
    };

    const handleDownloadEmployeeReport = async (type) => {
        setDownloadingReport(true);
        try {
            const endpoint = type === 'monthly'
                ? `/admin/employees/${id}/report/monthly/${reportMonth}`
                : `/admin/employees/${id}/report/yearly/${reportYear}`;

            const response = await api.get(endpoint, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const period = type === 'monthly' ? reportMonth : reportYear;
            link.setAttribute('download', `${employee?.name?.replace(/\s+/g, '_')}_${type}_${period}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success(`${type === 'monthly' ? 'Monthly' : 'Yearly'} report downloaded!`);
        } catch (error) {
            if (error.response?.data instanceof Blob) {
                const text = await error.response.data.text();
                try { toast.error(JSON.parse(text).message); } catch { toast.error(text || `Failed to download ${type} report`); }
            } else {
                toast.error(error.response?.data?.message || `Failed to download ${type} report`);
            }
        } finally {
            setDownloadingReport(false);
        }
    };

    if (loading) return <Layout><div className="text-center mt-20 text-slate-400">Loading...</div></Layout>;
    if (!employee) return <Layout><div className="text-center mt-20 text-slate-400">Employee not found</div></Layout>;

    const latestTx = transactions?.[0] || null;
    // Find latest tx that actually has loan data (may not be the very first tx)
    const latestLoanTx = transactions?.find(tx => tx.loanEMI > 0) || null;
    const latestLoanRepayment = latestLoanTx?.loanEMI || latestTx?.loanEMI || 0;
    const latestInterest = latestLoanTx?.interestPayment || latestTx?.interestPayment || 0;
    const latestMonthlyThrift = latestTx?.thriftDeduction || 0;
    const latestTotalAmount = (latestTx?.totalDeduction ?? (latestMonthlyThrift + latestLoanRepayment)) || 0;
    const hasLoanFlag = Boolean(employee.activeLoan) || String(employee.loanStatus || '').toLowerCase() === 'loan';

    return (
        <Layout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                        <User size={32} className="text-indigo-600 dark:text-indigo-400" />
                        {employee.name}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{employee.designation} • {employee.department}</p>
                    {employee.isActive === false && (
                        <p className="mt-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                            INACTIVE
                        </p>
                    )}
                </div>
                <div className="flex gap-3">
                    {editMode ? (
                        <>
                            <button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                                <Save size={18} /> Save
                            </button>
                            <button onClick={() => { setEditMode(false); setFormData(employee); }} className="bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                                <X size={18} /> Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setEditMode(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                                <Edit size={18} /> Edit Profile
                            </button>
                            {employee.isActive !== false && (
                                <button
                                    onClick={handleMarkInactive}
                                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <X size={18} /> Mark Inactive
                                </button>
                            )}
                            <button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                                <Trash size={18} /> Delete
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex gap-6">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`pb-3 px-1 font-medium transition-colors ${activeTab === 'overview' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('adjustments')}
                        className={`pb-3 px-1 font-medium transition-colors ${activeTab === 'adjustments' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        Financial Adjustments
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`pb-3 px-1 font-medium transition-colors ${activeTab === 'history' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        History & Transactions
                    </button>
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`pb-3 px-1 font-medium transition-colors ${activeTab === 'reports' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        Download Reports
                    </button>
                </div>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Personal Details */}
                    <div className="card lg:col-span-2">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 border-b border-slate-200 dark:border-slate-800 pb-2">Personal Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-sm text-slate-500 dark:text-slate-400 block mb-1">Full Name</label>
                                {editMode ? (
                                    <input type="text" name="name" value={formData.name || ''} onChange={handleInputChange} className="input py-2" />
                                ) : (
                                    <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{employee.name}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500 dark:text-slate-400 block mb-1">Email</label>
                                {editMode ? (
                                    <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} className="input py-2" />
                                ) : (
                                    <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{employee.email}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500 dark:text-slate-400 block mb-1">Department</label>
                                {editMode ? (
                                    <input type="text" name="department" value={formData.department || ''} onChange={handleInputChange} className="input py-2" />
                                ) : (
                                    <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{employee.department}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500 dark:text-slate-400 block mb-1">Designation</label>
                                {editMode ? (
                                    <input type="text" name="designation" value={formData.designation || ''} onChange={handleInputChange} className="input py-2" />
                                ) : (
                                    <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{employee.designation}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-slate-500 dark:text-slate-400 block mb-1">Phone</label>
                                {editMode ? (
                                    <input type="text" name="phone" value={formData.phone || ''} onChange={handleInputChange} className="input py-2" />
                                ) : (
                                    <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{employee.phone || '-'}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Financial Overview */}
                    <div className="card space-y-6">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 border-b border-slate-200 dark:border-slate-800 pb-2">Financial Overview</h3>

                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400"><IndianRupee size={20} /></div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Salary</p>
                                    <p className="text-lg font-bold text-slate-800 dark:text-white">₹{employee.salary.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400"><Activity size={20} /></div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Thrift Balance</p>
                                    <p className="text-lg font-bold text-slate-800 dark:text-white">₹{employee.thriftBalance.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Monthly: ₹{employee.thriftContribution.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600 dark:text-purple-400"><CreditCard size={20} /></div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Loan Status</p>
                                    <p className={`text-lg font-bold ${(employee.activeLoan || String(employee.loanStatus || '').toLowerCase() === 'loan') ? 'text-purple-600 dark:text-purple-300' : 'text-slate-400'}`}>
                                        {employee.activeLoan ? 'Active' : (String(employee.loanStatus || '').toLowerCase() === 'loan' ? 'Loan' : 'No Loan')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Loan Details */}
                    {employee.activeLoan && (
                        <div className="card lg:col-span-3">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 border-b border-slate-200 dark:border-slate-800 pb-2">Active Loan Details</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Loan Amount</p>
                                    <p className="font-semibold text-lg text-slate-800 dark:text-white">₹{employee.activeLoan.loanAmount?.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Remaining Balance</p>
                                    <p className="font-semibold text-lg text-slate-800 dark:text-white">₹{employee.activeLoan.remainingBalance?.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Monthly EMI</p>
                                    <p className="font-semibold text-lg text-indigo-600 dark:text-indigo-300">₹{employee.activeLoan.emi?.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Interest Rate</p>
                                    <p className="font-semibold text-lg text-slate-800 dark:text-white">{employee.activeLoan.interestRate}%</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Thrift Section */}
                    <div className="card lg:col-span-3">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-2">
                            <Activity size={22} className="text-blue-500 dark:text-blue-400" />
                            Thrift Section
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">CB Thrift Balance</p>
                                <p className="font-bold text-2xl text-blue-600 dark:text-blue-300">₹{(employee.thriftBalance || 0).toLocaleString()}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Closing / Accumulated Balance</p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Monthly Threft Amount</p>
                                <p className="font-bold text-2xl text-slate-800 dark:text-white">
                                    ₹{(latestMonthlyThrift || employee.thriftContribution || 0).toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    {latestTx ? `Last upload: ${latestTx.month}` : 'From employee record'}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Deduction (Last Month)</p>
                                <p className="font-bold text-2xl text-indigo-600 dark:text-indigo-300">
                                    ₹{latestTotalAmount.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    {latestTx ? `For ${latestTx.month}` : 'Upload monthly data to populate'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Loan Section */}
                    <div className="card lg:col-span-3">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-800 pb-2">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <CreditCard size={22} className="text-purple-500 dark:text-purple-400" />
                                Loan Section
                            </h3>
                        </div>

                        {hasLoanFlag && !employee.activeLoan && (
                            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
                                <span className="text-amber-600 dark:text-amber-400 text-sm">⚠️ Loan not yet linked. Re-upload the monthly Excel — loan data will be auto-linked during upload.</span>
                            </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Loan Re payment</p>
                                <p className="font-bold text-xl text-slate-800 dark:text-white">
                                    ₹{(latestLoanRepayment || employee.activeLoan?.emi || 0).toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    {latestLoanTx ? `Last: ${latestLoanTx.month}` : (employee.activeLoan ? 'Monthly EMI' : '—')}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Intrest</p>
                                <p className="font-bold text-xl text-slate-800 dark:text-white">
                                    ₹{latestInterest.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    {latestLoanTx ? `For ${latestLoanTx.month}` : 'No data yet'}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Loan (Remaining Balance)</p>
                                <p className={`font-bold text-xl ${employee.activeLoan ? 'text-orange-600 dark:text-orange-300' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {employee.activeLoan
                                        ? `₹${(employee.activeLoan.remainingBalance || 0).toLocaleString()}`
                                        : (hasLoanFlag ? '— Sync needed' : '—')}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Outstanding principal</p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Loan Amount (EMI)</p>
                                <p className="font-bold text-xl text-indigo-600 dark:text-indigo-300">
                                    ₹{(latestLoanTx?.loanAmount || employee.activeLoan?.emi || latestLoanRepayment || 0).toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Rate: {employee.activeLoan?.interestRate ?? '—'}%
                                </p>
                            </div>
                        </div>

                        {/* Loan Status + Sureties */}
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Loan Status</p>
                                <p className={`font-bold text-xl ${
                                    (employee.activeLoan || String(employee.loanStatus || '').toLowerCase() === 'loan')
                                        ? 'text-purple-600 dark:text-purple-300'
                                        : 'text-green-500 dark:text-green-400'
                                }`}>
                                    {employee.activeLoan ? 'Active' : (String(employee.loanStatus || '').toLowerCase() === 'loan' ? 'Loan' : 'No Loan')}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                {(() => {
                                    const populated = (employee.activeLoan?.sureties || []).filter(s => s && s.name);
                                    const rawIds = employee.activeLoan?.suretyEmpIds || [];
                                    const total = populated.length || rawIds.length;
                                    return (
                                        <>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Sureties ({total})</p>
                                            {populated.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {populated.map((s, i) => (
                                                        <span key={i} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                                            {s.name}{s.empId ? ` (ID: ${s.empId})` : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : rawIds.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {rawIds.map((id, i) => (
                                                        <span key={i} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                                            ID: {id}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-slate-400 dark:text-slate-500">— No sureties recorded</p>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {!employee.activeLoan && String(employee.loanStatus || '').toLowerCase() !== 'loan' && (
                            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    No active loan recorded. If this employee has a loan in your monthly Excel, 
                                    go to <strong>Uploads → Monthly Update</strong> and upload the Excel — the loan will be created automatically.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Adjustments Tab */}
            {activeTab === 'adjustments' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div 
                        onClick={() => openAdjustmentPanel('salary')}
                        className="card cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-400 transition-all hover:-translate-y-1"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400">
                                <IndianRupee size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">Adjust Salary</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Update monthly salary</p>
                            </div>
                        </div>
                    </div>

                    <div 
                        onClick={() => openAdjustmentPanel('thrift')}
                        className="card cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-400 transition-all hover:-translate-y-1"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                                <Activity size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">Adjust Thrift</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Update thrift contribution/balance</p>
                            </div>
                        </div>
                    </div>

                    {employee.activeLoan && (
                        <div 
                            onClick={() => openAdjustmentPanel('loan')}
                            className="card cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-400 transition-all hover:-translate-y-1"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600 dark:text-purple-400">
                                    <CreditCard size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100">Adjust Loan</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Update loan details</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
                <div className="space-y-8">
                    {/* Adjustment History */}
                    <div className="card">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-2">
                            <History size={24} className="text-indigo-600 dark:text-indigo-400" />
                            Adjustment History
                        </h3>
                        {history.length === 0 ? (
                            <p className="text-center py-8 text-slate-500 dark:text-slate-400">No adjustments recorded yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {history.map((item, idx) => (
                                    <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-slate-800 dark:text-slate-100 capitalize">{item.actionType.replace('_', ' ')}</p>
                                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{item.remarks}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                                    Old: {typeof item.oldValue === 'number' ? `₹${item.oldValue.toLocaleString()}` : item.oldValue} →
                                                    New: {typeof item.newValue === 'number' ? `₹${item.newValue.toLocaleString()}` : item.newValue}
                                                </p>
                                            </div>
                                            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                                                <p>{new Date(item.createdAt).toLocaleDateString()}</p>
                                                <p>{new Date(item.createdAt).toLocaleTimeString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Monthly Transactions */}
                    <div className="card">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center gap-2">
                            <Calendar size={24} className="text-indigo-600 dark:text-indigo-400" />
                            Monthly Transactions
                        </h3>
                        {transactions.length === 0 ? (
                            <p className="text-center py-8 text-slate-500 dark:text-slate-400">No transactions recorded yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-3">Month</th>
                                            <th className="px-4 py-3">Salary</th>
                                            <th className="px-4 py-3">Thrift</th>
                                            <th className="px-4 py-3">Loan EMI</th>
                                            <th className="px-4 py-3">Interest</th>
                                            <th className="px-4 py-3">Net Salary</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {transactions.map((tx, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium">{tx.month}</td>
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">₹{tx.salary.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">₹{tx.thriftDeduction.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">₹{tx.loanEMI.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">₹{tx.interestPayment.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-green-600 dark:text-green-400 font-bold">₹{tx.netSalary.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && (
                <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
                        <FileSpreadsheet size={24} className="text-indigo-600 dark:text-indigo-400" />
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Download Employee Reports</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Generate Excel reports for {employee.name}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Monthly Report */}
                        <div className="p-5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-2 mb-3">
                                <Calendar size={18} className="text-blue-600 dark:text-blue-400" />
                                <h4 className="font-semibold text-slate-800 dark:text-slate-100">Monthly Report</h4>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                                Employee details + salary statement for a specific month with thrift and loan deductions
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="month"
                                    value={reportMonth}
                                    onChange={(e) => setReportMonth(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <button
                                    onClick={() => handleDownloadEmployeeReport('monthly')}
                                    disabled={downloadingReport}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                >
                                    <Download size={16} />
                                    {downloadingReport ? '...' : 'Download'}
                                </button>
                            </div>
                        </div>

                        {/* Yearly Report */}
                        <div className="p-5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-2 mb-3">
                                <TrendingUp size={18} className="text-green-600 dark:text-green-400" />
                                <h4 className="font-semibold text-slate-800 dark:text-slate-100">Yearly Report</h4>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                                Full year breakdown with yearly thrift summary, loan payments, and net salary totals
                            </p>
                            <div className="flex gap-2">
                                <select
                                    value={reportYear}
                                    onChange={(e) => setReportYear(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => handleDownloadEmployeeReport('yearly')}
                                    disabled={downloadingReport}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                >
                                    <Download size={16} />
                                    {downloadingReport ? '...' : 'Download'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                        <p className="text-xs text-indigo-700 dark:text-indigo-300">
                            <strong>Excel Contents:</strong> Each report includes Employee Details sheet + Transaction sheet. 
                            Yearly reports also include a dedicated Yearly Thrift Summary sheet with monthly vs accumulated thrift data.
                        </p>
                    </div>
                </div>
            )}

            {/* Adjustment Modal */}
            {showAdjustmentPanel && (
                <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <div className="card w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white capitalize">{adjustmentType} Adjustment</h3>
                            <button onClick={() => setShowAdjustmentPanel(false)} className="text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {adjustmentType === 'salary' && (
                                <>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Current Salary</label>
                                        <p className="text-lg font-bold text-slate-800 dark:text-white">₹{employee.salary.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">New Salary (₹)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={adjustmentData.newSalary || ''}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, newSalary: Number(e.target.value) })}
                                            placeholder="Enter new salary"
                                        />
                                    </div>
                                </>
                            )}

                            {adjustmentType === 'thrift' && (
                                <>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Current Monthly Contribution</label>
                                        <p className="text-lg font-bold text-slate-800 dark:text-white">₹{employee.thriftContribution.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">New Monthly Contribution (₹)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={adjustmentData.newThriftContribution || ''}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, newThriftContribution: Number(e.target.value) })}
                                            placeholder="Enter new contribution"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Current Balance</label>
                                        <p className="text-lg font-bold text-slate-800 dark:text-white">₹{employee.thriftBalance.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Adjust Balance To (₹)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={adjustmentData.newThriftBalance || ''}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, newThriftBalance: Number(e.target.value) })}
                                            placeholder="Enter corrected balance"
                                        />
                                    </div>
                                </>
                            )}

                            {adjustmentType === 'loan' && employee.activeLoan && (
                                <>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Current Loan Amount</label>
                                        <p className="text-lg font-bold text-slate-800 dark:text-white">₹{employee.activeLoan.loanAmount.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">New Loan Amount (Top-up)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={adjustmentData.loanAmount || ''}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, loanAmount: Number(e.target.value) })}
                                            placeholder="Enter new total"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Current EMI</label>
                                        <p className="text-lg font-bold text-slate-800 dark:text-white">₹{employee.activeLoan.emi.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">New EMI (₹)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={adjustmentData.emi || ''}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, emi: Number(e.target.value) })}
                                            placeholder="Enter new EMI"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Interest Rate (%)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={adjustmentData.interestRate || ''}
                                            onChange={(e) => setAdjustmentData({ ...adjustmentData, interestRate: Number(e.target.value) })}
                                            placeholder="Enter new rate"
                                        />
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Remarks</label>
                                <textarea
                                    className="input"
                                    rows="3"
                                    value={adjustmentData.remarks || ''}
                                    onChange={(e) => setAdjustmentData({ ...adjustmentData, remarks: e.target.value })}
                                    placeholder="Reason for adjustment..."
                                />
                            </div>

                            <button 
                                onClick={handleAdjustmentSubmit}
                                className="btn btn-primary w-full mt-4"
                            >
                                Apply Adjustment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default EmployeeDetailsEnhanced;
