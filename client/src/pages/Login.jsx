import { useState, useContext } from 'react';
import { flushSync } from 'react-dom';
import AuthContext from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import FullScreenLoader from '../components/FullScreenLoader';

const Login = () => {
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loggingIn, setLoggingIn] = useState(false);
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loggingIn) return;
        // Ensure the UI reflects loading immediately (React 18 async batching can delay this)
        flushSync(() => setLoggingIn(true));
        try {
            const user = await login(formData.username, formData.password);
            toast.success('Login Successful');

            if (user.isFirstLogin && user.role !== 'admin') {
                // Admin shouldn't be forced on first login unless desired, 
                // usually admins are created manually or via seed with known password.
                // But employees definitely need this.
                navigate('/change-password');
                return;
            }

            if (user.role === 'admin') {
                navigate('/admin');
            } else {
                navigate('/dashboard');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Login Failed');
        } finally {
            setLoggingIn(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-dark">
            {loggingIn && (
                <FullScreenLoader
                    label="Logging in…"
                    overlay
                    zIndexClass="z-[60]"
                />
            )}
            {!loggingIn && (
                <div className="card w-full max-w-md">
                    <div className="flex flex-col items-center mb-6">
                        <img src="/logo.png" alt="Vignan Logo" className="h-16 w-16 object-contain mb-3" />
                        <h2 className="text-2xl font-bold text-center text-primary">Vignan Thrift Society</h2>
                    </div>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Emp ID / Username</label>
                            <input
                                type="text"
                                name="username"
                                className="input"
                                value={formData.username}
                                onChange={handleChange}
                                autoComplete="username"
                                required
                                disabled={loggingIn}
                            />
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Employee login uses Emp ID as username after credential reset.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    className="input pr-10"
                                    value={formData.password}
                                    onChange={handleChange}
                                    autoComplete="current-password"
                                    required
                                    disabled={loggingIn}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    disabled={loggingIn}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loggingIn}
                            className={`btn btn-primary mt-2 flex items-center justify-center gap-2 ${loggingIn ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {loggingIn && <Loader2 size={18} className="animate-spin" />}
                            {loggingIn ? 'Logging in…' : 'Login'}
                        </button>
                        <div className="text-center mt-2">
                            <Link
                                to="/forgot-password"
                                className={`text-sm text-indigo-400 hover:text-indigo-300 transition-colors ${loggingIn ? 'pointer-events-none opacity-60' : ''}`}
                                aria-disabled={loggingIn}
                                tabIndex={loggingIn ? -1 : 0}
                            >
                                Forgot Password?
                            </Link>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Login;
