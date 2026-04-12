import { useState, useEffect } from 'react';
import api from '../../api/axios';
import Layout from '../../components/Layout';
import { Play, CheckCircle, Loader } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MonthlyProcessing = () => {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [previews, setPreviews] = useState([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [stats, setStats] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sendingSms, setSendingSms] = useState(false);

    const handlePreview = async () => {
        if (!month) return toast.error('Please select a month');
        setLoading(true);
        setPreviews([]);
        setStats(null);
        try {
            const { data } = await api.get(`/admin/monthly/preview/${month}`);
            setPreviews(data.previews);
            
            // Calculate stats
            const totalThrift = data.previews.reduce((s, p) => s + p.thriftDeduction, 0);
            const totalEmi = data.previews.reduce((s, p) => s + p.loanEMI, 0);
            const totalPrincipal = data.previews.reduce((s, p) => s + p.principalRepayment, 0);
            const totalInterest = data.previews.reduce((s, p) => s + p.interestPayment, 0);
            
            setStats({
                totalEmployees: data.totalEmployees,
                totalThrift,
                totalEmi,
                totalPrincipal,
                totalInterest
            });
            toast.success('Preview generated successfully!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to generate preview');
        } finally {
            setLoading(false);
        }
    };

    const handleProcess = async () => {
        if (previews.length === 0) return toast.error('Please generate a preview first');
        if (!window.confirm(`Are you sure you want to process transactions for ${month}? This cannot be undone.`)) return;
        
        setProcessing(true);
        try {
            const { data } = await api.post('/admin/monthly/process', { month, data: previews });
            toast.success(data.message);

            setSendingSms(true);
            try {
                const smsRes = await api.post('/admin/notify/monthly-sms', { month });
                const smsData = smsRes.data;
                if (smsData.errors?.length > 0) {
                    toast(`SMS sent: ${smsData.sent}/${smsData.total}, failed: ${smsData.errors.length}`, {
                        icon: '⚠️',
                        duration: 6000,
                        style: { background: '#fef3c7', color: '#92400e' }
                    });
                } else {
                    toast.success(`SMS sent to ${smsData.sent} employee(s)`);
                }
            } catch (smsError) {
                toast.error(smsError.response?.data?.message || 'Monthly processed, but SMS failed');
            } finally {
                setSendingSms(false);
            }

            setPreviews([]); // Clear preview after successful process
            setStats(null);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to process monthly transactions');
        } finally {
            setProcessing(false);
        }
    };

    const filteredPreviews = previews.filter(
        (p) => p.name.toLowerCase().includes(searchTerm.toLowerCase())
            || (p.empId && p.empId.toString().toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Helper for manual override of single employee's values
    const updatePreviewRow = (index, field, value) => {
        const newPreviews = [...previews];
        const val = Number(value) || 0;
        newPreviews[index] = { ...newPreviews[index], [field]: val };
        
        // Recalculate dependent fields
        const row = newPreviews[index];
        row.totalDeduction = row.thriftDeduction + row.loanEMI;
        row.netSalary = Math.max(0, row.salary - row.totalDeduction);
        row.principalRepayment = Math.max(0, row.loanEMI - row.interestPayment);
        row.newThriftBalance = row.currentThriftBalance + row.thriftDeduction;
        row.newLoanBalance = Math.max(0, row.currentLoanBalance - row.principalRepayment);
        
        setPreviews(newPreviews);
        
        // Update stats
        const totalThrift = newPreviews.reduce((s, p) => s + p.thriftDeduction, 0);
        const totalEmi = newPreviews.reduce((s, p) => s + p.loanEMI, 0);
        const totalPrincipal = newPreviews.reduce((s, p) => s + p.principalRepayment, 0);
        const totalInterest = newPreviews.reduce((s, p) => s + p.interestPayment, 0);
        
        setStats({
            totalEmployees: newPreviews.length,
            totalThrift,
            totalEmi,
            totalPrincipal,
            totalInterest
        });
    };

    return (
        <Layout>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Monthly Processing</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Automatically generate monthly deductions and interest calculations</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full md:w-64">
                    <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">Processing Month</label>
                    <input 
                        type="month" 
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="input"
                    />
                </div>
                <button 
                    onClick={handlePreview}
                    disabled={loading || processing}
                    className="btn btn-primary flex items-center justify-center gap-2 group whitespace-nowrap"
                >
                    {loading ? <Loader className="animate-spin" size={20} /> : <Play size={20} />}
                    <span>Generate Preview</span>
                </button>
            </div>

            {previews.length > 0 && (
                <div className="mb-4">
                    <input 
                        type="text" 
                        placeholder="Search by Employee Name or ID..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input w-full md:w-1/3"
                    />
                </div>
            )}

            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Employees</p>
                        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.totalEmployees}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Thrift Deduction</p>
                        <p className="text-2xl font-bold text-green-600">₹{stats.totalThrift}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Loan EMI</p>
                        <p className="text-2xl font-bold text-blue-600">₹{stats.totalEmi}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Total Interest</p>
                        <p className="text-2xl font-bold text-orange-600">₹{stats.totalInterest}</p>
                    </div>
                </div>
            )}

            {previews.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm transition-colors mb-6">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-xs font-semibold">
                                <tr>
                                    <th className="px-4 py-3">Employee</th>
                                    <th className="px-4 py-3">Salary</th>
                                    <th className="px-4 py-3 text-green-600">Thrift Ded.</th>
                                    <th className="px-4 py-3 text-blue-600">Loan EMI</th>
                                    <th className="px-4 py-3 text-orange-600">Interest</th>
                                    <th className="px-4 py-3 text-indigo-600">Principal</th>
                                    <th className="px-4 py-3">Total Ded.</th>
                                    <th className="px-4 py-3">Net Salary</th>
                                    <th className="px-4 py-3 text-slate-400">CB Thrift</th>
                                    <th className="px-4 py-3 text-slate-400">Bal Loan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {filteredPreviews.map((preview) => {
                                    const idx = previews.findIndex(p => p.employee === preview.employee);
                                    return (
                                    <tr key={preview.employee} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-800 dark:text-slate-200">{preview.name}</div>
                                            <div className="text-xs text-slate-500">{preview.empId}</div>
                                        </td>
                                        <td className="px-4 py-3">₹{preview.salary}</td>
                                        <td className="px-4 py-3">
                                            <input 
                                                type="number" 
                                                value={preview.thriftDeduction}
                                                onChange={(e) => updatePreviewRow(idx, 'thriftDeduction', e.target.value)}
                                                className="w-24 bg-transparent border-b border-dashed border-green-300 dark:border-green-800 focus:outline-none focus:border-green-500"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input 
                                                type="number" 
                                                value={preview.loanEMI}
                                                onChange={(e) => updatePreviewRow(idx, 'loanEMI', e.target.value)}
                                                className="w-24 bg-transparent border-b border-dashed border-blue-300 dark:border-blue-800 focus:outline-none focus:border-blue-500"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-orange-600">₹{preview.interestPayment}</td>
                                        <td className="px-4 py-3 text-indigo-600">₹{preview.principalRepayment}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">₹{preview.totalDeduction}</td>
                                        <td className="px-4 py-3 font-semibold text-emerald-600">₹{preview.netSalary}</td>
                                        <td className="px-4 py-3 text-slate-500">₹{preview.newThriftBalance}</td>
                                        <td className="px-4 py-3 text-slate-500">₹{preview.newLoanBalance}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {previews.length > 0 && (
                <div className="flex justify-end p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-sm">
                    <button 
                        onClick={handleProcess}
                        disabled={processing || sendingSms}
                        className="btn bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 group"
                    >
                        {(processing || sendingSms) ? <Loader className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                        <span>
                            {processing
                                ? `Processing ${month}...`
                                : sendingSms
                                    ? 'Sending SMS...'
                                    : `Finalize, Process & Send SMS (All)`}
                        </span>
                    </button>
                </div>
            )}
        </Layout>
    );
};

export default MonthlyProcessing;
