import { Link, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import AuthContext from '../context/AuthContext';
import useTheme from '../context/ThemeContext';
import { LayoutDashboard, Users, User, FileText, Upload, LogOut, Settings, Moon, Sun, RefreshCw, Wallet, Shield, Calendar } from 'lucide-react';

const Sidebar = () => {
    const { user, logout } = useContext(AuthContext);
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();

    const isActive = (path) => location.pathname === path
        ? 'bg-indigo-600 text-white shadow-md'
        : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';

    return (
        <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen fixed transition-colors duration-200 z-10">
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                    <img src="/logo.png" alt="Vignan Logo" className="h-8 w-8 object-contain" />
                    <span className="font-bold text-lg text-indigo-600 dark:text-indigo-400">Vignan Society</span>
                </div>
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                    aria-label="Toggle Theme"
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-2">
                {user?.role === 'admin' && (
                    <>
                        <Link to="/admin" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/admin')}`}>
                            <LayoutDashboard size={20} />
                            <span>Dashboard</span>
                        </Link>
                        <Link to="/admin/employees" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/admin/employees')}`}>
                            <Users size={20} />
                            <span>Employees</span>
                        </Link>
                        <Link to="/admin/upload" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/admin/upload')}`}>
                            <Upload size={20} />
                            <span>Uploads</span>
                        </Link>
                        <Link to="/admin/monthly-processing" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/admin/monthly-processing')}`}>
                            <Calendar size={20} />
                            <span>Process Month</span>
                        </Link>
                        <Link to="/admin/loans" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/admin/loans')}`}>
                            <FileText size={20} />
                            <span>Loans</span>
                        </Link>
                        <Link to="/admin/thrift" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/admin/thrift')}`}>
                            <Wallet size={20} />
                            <span>Thrift</span>
                        </Link>
                        <Link to="/admin/yearly-thrift" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/admin/yearly-thrift')}`}>
                            <RefreshCw size={20} />
                            <span>Yearly Thrift</span>
                        </Link>
                    </>
                )}

                {user?.role === 'employee' && (
                    <>
                        <Link to="/dashboard" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/dashboard')}`}>
                            <LayoutDashboard size={20} />
                            <span>Dashboard</span>
                        </Link>
                        <Link to="/employee/transactions" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/employee/transactions')}`}>
                            <FileText size={20} />
                            <span>Transactions</span>
                        </Link>
                        <Link to="/employee/loan" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/employee/loan')}`}>
                            <Wallet size={20} />
                            <span>My Loan</span>
                        </Link>
                        <Link to="/employee/sureties" className={`flex items-center space-x-3 px-4 py-3 rounded-lg ${isActive('/employee/sureties')}`}>
                            <Shield size={20} />
                            <span>Sureties</span>
                        </Link>
                    </>
                )}
            </nav>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                <button onClick={logout} className="flex items-center space-x-3 px-4 py-3 w-full rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors">
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

const Layout = ({ children }) => {
    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
            <Sidebar />
            <div className="flex-1 ml-64 p-8">
                <main className="animate-fade-in">
                    {children}
                </main>
                <footer className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-slate-500 text-sm">
                    &copy; {new Date().getFullYear()} Vignan Employees Aided Thrift & Credit Society
                </footer>
            </div>
        </div>
    );
};

export default Layout;
