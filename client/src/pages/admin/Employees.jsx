import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Layout from '../../components/Layout';
import { UserPlus, Search, CreditCard, IndianRupee, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Download, Upload } from 'lucide-react';

const Employees = () => {
    const navigate = useNavigate();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [formData, setFormData] = useState({
        empId: '',
        name: '',
        email: '',
        department: 'Non Teaching',
        designation: 'General',
        phone: '',
        salary: '',
        thriftContribution: ''
    });
    const [createdCredentials, setCreatedCredentials] = useState(null);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        try {
            const { data } = await api.get('/admin/employees');
            setEmployees(data);
        } catch (error) {
            console.error('Failed to fetch employees', error);
            toast.error('Failed to load employees');
        } finally {
            setLoading(false);
        }
    };

    const q = String(searchTerm || '').toLowerCase();
    const filteredEmployees = employees.filter(emp =>
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.email || '').toLowerCase().includes(q)
    );

    const handleCreateEmployee = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.post('/admin/employees', formData);
            toast.success('Employee created successfully!');
            setCreatedCredentials(data.tempCredentials);
            fetchEmployees();
            setFormData({
                empId: '', name: '', email: '', department: '', designation: '', phone: '', salary: '', thriftContribution: ''
            });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create employee');
        }
    };

    return (
        <Layout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Employees</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Manage all registered members</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/admin/upload')}
                        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg shadow-sm transition-colors"
                    >
                        <Upload size={20} />
                        <span>Bulk Upload</span>
                    </button>
                    <button
                        onClick={() => {
                            setCreatedCredentials(null);
                            setShowCreateModal(true);
                        }}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-sm transition-colors"
                    >
                        <UserPlus size={20} />
                        <span>Add Employee</span>
                    </button>
                </div>
            </div>

            <div className="mb-8 relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Search employees by name or email..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-3 pl-10 pr-4 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 shadow-sm transition-colors"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="text-center py-8 text-slate-500">Loading...</div>
            ) : filteredEmployees.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No employees found.</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredEmployees.map((emp) => {
                        const hasLoan = Boolean(emp.activeLoan) || String(emp.loanStatus || '').toLowerCase() === 'loan';
                        const isInactive = emp.isActive === false;

                        return (
                            <Link
                                to={`/admin/employees/${emp._id}`}
                                key={emp._id}
                                className={`card relative overflow-hidden bg-white dark:bg-slate-900 border rounded-xl p-6 transition-all cursor-pointer group hover:-translate-y-1 block shadow-sm ${
                                    isInactive
                                        ? 'border-red-300 dark:border-red-800 opacity-80'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500'
                                }`}
                            >
                            {isInactive && (
                                <div className="absolute -right-12 top-5 rotate-45 bg-red-600 text-white text-[10px] tracking-widest font-bold py-1 w-40 text-center shadow-md pointer-events-none">
                                    INACTIVE
                                </div>
                            )}
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl font-bold group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    {emp.name.charAt(0)}
                                </div>
                                <div className={`px-2 py-1 text-xs font-semibold rounded-full ${hasLoan ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300' : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300'
                                    }`}>
                                    {hasLoan ? 'Loan' : 'No Loan'}
                                </div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{emp.name}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{emp.designation} &bull; {emp.department}</p>

                            {/* Thrift Section */}
                            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-1.5">
                                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1 mb-2">
                                    <Wallet size={13} /> Thrift
                                </p>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">CB Balance</span>
                                    <span className="font-bold text-blue-700 dark:text-blue-300">₹{(emp.thriftBalance || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Monthly</span>
                                    <span className="font-semibold text-slate-700 dark:text-slate-200">₹{(emp.thriftContribution || 0).toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Loan Section */}
                            {(emp.activeLoan || String(emp.loanStatus || '').toLowerCase() === 'loan') && (
                                <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-1.5 mt-3">
                                    <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide flex items-center gap-1 mb-2">
                                        <CreditCard size={13} /> Loan
                                    </p>
                                    {emp.activeLoan ? (
                                        <>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500 dark:text-slate-400">Balance</span>
                                                <span className="font-bold text-orange-600 dark:text-orange-300">₹{(emp.activeLoan.remainingBalance || 0).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500 dark:text-slate-400">EMI</span>
                                                <span className="font-semibold text-slate-700 dark:text-slate-200">₹{(emp.activeLoan.emi || 0).toLocaleString()}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-sm text-slate-500 dark:text-slate-400">Loan on record</div>
                                    )}
                                </div>
                            )}
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* Create Employee Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Create New Employee</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                <Search size={24} className="opacity-0 hidden" /> {/* spacer placeholder */}
                                <span className="text-lg font-bold">✕</span>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto">
                            {createdCredentials ? (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Employee Created!</h3>
                                    <p className="text-slate-500 dark:text-slate-400 mb-6">The employee account has been created. Please note down their temporary login credentials.</p>
                                    
                                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-md mx-auto text-left">
                                        <div className="mb-4">
                                            <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Username / Login ID</span>
                                            <span className="font-mono text-lg text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 px-3 py-1 rounded inline-block border border-slate-100 dark:border-slate-800">{createdCredentials.username}</span>
                                        </div>
                                        <div>
                                            <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Temporary Password</span>
                                            <span className="font-mono text-lg text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900 px-3 py-1 rounded inline-block border border-slate-100 dark:border-slate-800">{createdCredentials.password}</span>
                                        </div>
                                    </div>
                                    
                                    <button onClick={() => setShowCreateModal(false)} className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors">
                                        Done
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleCreateEmployee} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Employee ID</label>
                                            <input required type="text" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.empId} onChange={e => setFormData({...formData, empId: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                                            <input required type="text" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                                            <input type="email" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                                            <input type="text" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Department</label>
                                            <input required type="text" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Designation</label>
                                            <input required type="text" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.designation} onChange={e => setFormData({...formData, designation: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Salary (₹)</label>
                                            <input type="number" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.salary} onChange={e => setFormData({...formData, salary: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Monthly Thrift Contentration (₹)</label>
                                            <input required type="number" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={formData.thriftContribution} onChange={e => setFormData({...formData, thriftContribution: e.target.value})} />
                                        </div>
                                    </div>
                                    
                                    <div className="pt-4 flex justify-end gap-3 mt-6 border-t border-slate-200 dark:border-slate-800">
                                        <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                            Cancel
                                        </button>
                                        <button type="submit" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors">
                                            Create Employee
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default Employees;
