import { useState, useRef, useEffect } from 'react';
import api from '../../api/axios';
import Layout from '../../components/Layout';
import { Upload as UploadIcon, FileText, CheckCircle, AlertCircle, UserPlus, SendHorizonal, RefreshCw, Mail, Bell, MessageSquare, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';

const Upload = () => {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [log, setLog] = useState(null);
    const [createdUsers, setCreatedUsers] = useState(null);
    const [skippedExisting, setSkippedExisting] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [columnSummary, setColumnSummary] = useState(null);
    const [showUploadLogs, setShowUploadLogs] = useState(false);

    const [uploadType, setUploadType] = useState('employees'); // 'employees' or 'monthly'
    const [uploadProgress, setUploadProgress] = useState(0); // 0-100 display %
    // 'idle' | 'uploading' | 'processing' | 'done'
    const [uploadPhase, setUploadPhase] = useState('idle');
    const progressIntervalRef = useRef(null);
    const [regenerating, setRegenerating] = useState(false);
    const [emailsSent, setEmailsSent] = useState(null);
    const [emailErrors, setEmailErrors] = useState([]);
    const [uploadedMonth, setUploadedMonth] = useState(null);
    const [sendingNotification, setSendingNotification] = useState(false);
    const [notificationResult, setNotificationResult] = useState(null);
    const [sendingSms, setSendingSms] = useState(false);
    const [smsResult, setSmsResult] = useState(null);

    // Auto-load latest uploaded month so SMS/Email buttons work without re-uploading
    useEffect(() => {
        api.get('/admin/reports/monthly-history')
            .then(({ data }) => {
                if (Array.isArray(data) && data.length > 0) {
                    // Response is sorted newest-first; each item is { month, employeeCount, ... }
                    const latest = data[0]?.month || null;
                    if (latest) setUploadedMonth(prev => prev || latest);
                }
            })
            .catch(() => {}); // silently ignore if endpoint unavailable
    }, []);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) {
            toast.error('Please select a file');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        setUploading(true);
        setUploadProgress(0);
        setUploadPhase('uploading');
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        setLog(null);
        setCreatedUsers(null);
        setSkippedExisting([]);
        setWarnings([]);
        setColumnSummary(null);
        setShowUploadLogs(false);
        setEmailsSent(null);
        setEmailErrors([]);
        setUploadedMonth(null);
        setNotificationResult(null);
        setSmsResult(null);

        const endpoint = uploadType === 'employees' ? '/admin/upload/employees' : '/admin/upload/monthly';

        try {
            const { data } = await api.post(endpoint, formData, {
                onUploadProgress: (progressEvent) => {
                    const ratio = progressEvent.total
                        ? progressEvent.loaded / progressEvent.total
                        : 0;
                    // Phase 1: real HTTP upload → display 0–30%
                    setUploadProgress(Math.round(ratio * 30));
                    if (ratio >= 1 && !progressIntervalRef.current) {
                        // File fully transferred — start slow crawl 30→92% while server processes rows
                        setUploadPhase('processing');
                        progressIntervalRef.current = setInterval(() => {
                            setUploadProgress(prev => {
                                if (prev >= 92) {
                                    clearInterval(progressIntervalRef.current);
                                    progressIntervalRef.current = null;
                                    return 92;
                                }
                                // Ease-out: faster early, slower near 92
                                const step = prev < 55 ? 0.9 : prev < 75 ? 0.45 : 0.15;
                                return Math.min(92, parseFloat((prev + step).toFixed(1)));
                            });
                        }, 250);
                    }
                }
            });
            setLog(data.log);
            if (data.createdUsers) setCreatedUsers(data.createdUsers);
            if (data.skippedExisting && data.skippedExisting.length > 0) {
                setSkippedExisting(data.skippedExisting);
            }
            if (data.columnSummary) setColumnSummary(data.columnSummary);
            if (data.uploadedMonth) setUploadedMonth(data.uploadedMonth);
            if (data.emailsSent != null) setEmailsSent(data.emailsSent);
            if (data.emailErrors && data.emailErrors.length > 0) setEmailErrors(data.emailErrors);
            if (data.warnings && data.warnings.length > 0) {
                setWarnings(data.warnings);
                toast(`${data.warnings.length} data warning(s) found - check details below`, {
                    icon: '⚠️',
                    duration: 5000,
                    style: { background: '#fef3c7', color: '#92400e' }
                });
            }
            if (data.log?.failureCount > 0) {
                toast(`Upload completed with ${data.log.failureCount} error(s) - rows were skipped`, {
                    icon: '⚠️',
                    duration: 5000,
                    style: { background: '#fef3c7', color: '#92400e' }
                });
            } else if (data.skippedExisting?.length > 0 && data.log?.successCount > 0) {
                toast.success(`${data.log.successCount} new employee(s) created, ${data.skippedExisting.length} already existed`);
            } else if (data.skippedExisting?.length > 0 && data.log?.successCount === 0) {
                toast('All employees already exist in the system', {
                    icon: 'ℹ️',
                    duration: 5000,
                    style: { background: '#dbeafe', color: '#1e40af' }
                });
            } else {
                toast.success('Upload complete!');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Upload failed');
        } finally {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            setUploadProgress(100);
            setUploadPhase('done');
            // Hold at 100% briefly so the user sees it, then reset
            setTimeout(() => {
                setUploadProgress(0);
                setUploadPhase('idle');
                setUploading(false);
            }, 1200);
        }
    };

    const buildAndDownloadCsv = (users, filename) => {
        const headers = ['Emp ID', 'Name', 'Username', 'Password'];
        const rows = users.map(u => [u.empId, u.name, u.username || u.empId, u.password]);
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csvContent = [
            headers.map(escape).join(','),
            ...rows.map(r => r.map(escape).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadCredentials = () => {
        if (!createdUsers || createdUsers.length === 0) return;
        buildAndDownloadCsv(createdUsers, 'employee_credentials.csv');
    };

    const handleRegenerateCredentials = async () => {
        if (!window.confirm(
            'This will RESET PASSWORDS for all employees.\n' +
            'They will need to log in with the new passwords.\n\nContinue?'
        )) return;
        setRegenerating(true);
        try {
            const { data } = await api.post('/admin/employees/regenerate-credentials');
            toast.success(`Passwords reset for ${data.credentials.length} employees`);
            buildAndDownloadCsv(data.credentials, 'employee_credentials_reset.csv');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to regenerate credentials');
        } finally {
            setRegenerating(false);
        }
    };

    const handleSendNotification = async () => {
        if (!uploadedMonth) return;
        setSendingNotification(true);
        setNotificationResult(null);
        try {
            const { data } = await api.post('/admin/notify/monthly-update', { month: uploadedMonth });
            setNotificationResult(data);
            if (data.errors && data.errors.length > 0) {
                toast(`Sent to ${data.sent} employee(s), ${data.errors.length} failed`, {
                    icon: '⚠️',
                    duration: 5000,
                    style: { background: '#fef3c7', color: '#92400e' }
                });
            } else {
                toast.success(data.message);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send notifications');
        } finally {
            setSendingNotification(false);
        }
    };

    const handleSendSms = async () => {
        if (!uploadedMonth) return;
        setSendingSms(true);
        setSmsResult(null);
        try {
            const { data } = await api.post('/admin/notify/monthly-sms', { month: uploadedMonth });
            setSmsResult(data);
            if (data.errors && data.errors.length > 0) {
                toast(`SMS sent to ${data.sent}, ${data.errors.length} failed`, {
                    icon: '⚠️',
                    duration: 5000,
                    style: { background: '#fef3c7', color: '#92400e' }
                });
            } else {
                toast.success(data.message);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send SMS');
        } finally {
            setSendingSms(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const type = uploadType === 'employees' ? 'employees' : 'monthly';
            const fileName = type === 'employees' ? 'employee_upload_template.xlsx' : 'monthly_upload_template.xlsx';
            const response = await api.get(`/admin/upload/template/${type}`, { responseType: 'blob' });

            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
            toast.success('Template downloaded');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to download template');
        }
    };

    return (
        <Layout>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Upload Data</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Bulk import employees or monthly updates</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8">
                    <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
                        <button
                            onClick={() => setUploadType('employees')}
                            className={`pb-2 text-sm font-medium transition-colors ${uploadType === 'employees' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            Employee Data
                        </button>
                        <button
                            onClick={() => setUploadType('monthly')}
                            className={`pb-2 text-sm font-medium transition-colors ${uploadType === 'monthly' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        >
                            Monthly Update
                        </button>
                    </div>

                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                        <UserPlus size={24} className="text-indigo-600 dark:text-indigo-400" />
                        {uploadType === 'employees' ? 'Import Employees' : 'Upload Monthly Data'}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                        {uploadType === 'employees'
                            ? 'Upload an Excel (.xlsx) with employee data. Supports Vignan format (Emp. ID, Name of the Employ, CB Thrift Amount As on, Monthly Threft Amount) or simple format (Name, Email, Department, Designation, Salary). Login accounts are created using Emp ID as username.'
                            : (
                                <>
                                    Upload Vignan Society monthly Excel (.xlsx). Expected columns from reference template:
                                    <span className="block mt-2 font-mono text-xs bg-slate-100 dark:bg-slate-800 rounded p-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                                        Emp. ID &nbsp;|&nbsp; Name of the Employ &nbsp;|&nbsp; CB Thrift Amount As on &nbsp;|&nbsp; Loan
                                        &nbsp;|&nbsp; Loan Re payment &nbsp;|&nbsp; Intrest &nbsp;|&nbsp; Monthly Threft Amount
                                        &nbsp;|&nbsp; Total&nbsp;&nbsp;Amount &nbsp;|&nbsp; Paid Amount &nbsp;|&nbsp; Loan Amount
                                        &nbsp;|&nbsp; Thrift &nbsp;|&nbsp; Total monthly deduction
                                        &nbsp;|&nbsp; surity1–surity6 Emp .ID
                                    </span>
                                    <span className="block mt-1 text-xs text-slate-400">Typos like ‘Intrest’ and ‘Threft’ are handled automatically.</span>
                                </>
                            )}
                    </p>

                    <button
                        type="button"
                        onClick={downloadTemplate}
                        className="mb-6 w-full btn bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2"
                    >
                        <Download size={16} />
                        {uploadType === 'employees' ? 'Download Employee Upload Template (.xlsx)' : 'Download Monthly Upload Template (.xlsx)'}
                    </button>

                    <form onSubmit={handleUpload} className="flex flex-col gap-4">
                        <div className="bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-500 transition-colors">
                            <input
                                type="file"
                                onChange={handleFileChange}
                                accept=".xlsx, .xls, .csv"
                                className="hidden"
                                id="employee-upload"
                            />
                            <label htmlFor="employee-upload" className="cursor-pointer flex flex-col items-center">
                                <UploadIcon size={40} className="text-slate-400 dark:text-slate-500 mb-4" />
                                <span className="text-slate-700 dark:text-slate-300 font-medium">Click to select file</span>
                                <span className="text-slate-500 text-sm mt-1">{file ? file.name : 'No file selected'}</span>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={uploading || !file}
                            className={`btn btn-primary w-full py-3 flex items-center justify-center gap-2 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {uploading
                                ? uploadPhase === 'done'
                                    ? '✓ Complete!'
                                    : uploadPhase === 'processing'
                                        ? `Processing rows… ${Math.round(uploadProgress)}%`
                                        : `Uploading file… ${Math.round(uploadProgress)}%`
                                : 'Start Import'}
                        </button>

                        {/* Progress bar — shown while uploading */}
                        {uploading && (
                            <div className="mt-2 space-y-1">
                                {/* Phase labels */}
                                <div className="flex justify-between text-xs mb-1">
                                    <span className={`font-medium ${
                                        uploadPhase === 'done'       ? 'text-green-400' :
                                        uploadPhase === 'processing' ? 'text-amber-400' :
                                        'text-indigo-400'
                                    }`}>
                                        {uploadPhase === 'done'       ? '✓ Upload complete' :
                                         uploadPhase === 'processing' ? '⚙️ Processing employee records & transactions…' :
                                         '📤 Uploading file to server…'}
                                    </span>
                                    <span className={`font-bold ${
                                        uploadPhase === 'done'       ? 'text-green-400' :
                                        uploadPhase === 'processing' ? 'text-amber-400' :
                                        'text-indigo-400'
                                    }`}>{Math.round(uploadProgress)}%</span>
                                </div>

                                {/* Track */}
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                                    <div
                                        className={`h-3 rounded-full transition-all duration-300 ${
                                            uploadPhase === 'done'       ? 'bg-green-500' :
                                            uploadPhase === 'processing' ? 'bg-amber-500' :
                                            'bg-indigo-500'
                                        }`}
                                        style={{ width: `${Math.round(uploadProgress)}%` }}
                                    />
                                </div>

                                {/* Sub-step hint */}
                                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                                    <span className={uploadPhase === 'uploading'  ? 'text-indigo-400 font-semibold' : ''}>📤 Uploading (0–30%)</span>
                                    <span className={uploadPhase === 'processing' ? 'text-amber-400 font-semibold'  : ''}>⚙️ Processing (30–92%)</span>
                                    <span className={uploadPhase === 'done'       ? 'text-green-400 font-semibold'  : ''}>✓ Done (100%)</span>
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                {log && (
                    <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 animate-fade-in">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                            <FileText size={24} className="text-green-500 dark:text-green-400" />
                            Upload Summary
                        </h3>

                        {(
                            (log?.errorLog && log.errorLog.length > 0) ||
                            skippedExisting.length > 0 ||
                            warnings.length > 0 ||
                            !!columnSummary
                        ) && (
                            <button
                                type="button"
                                onClick={() => setShowUploadLogs(v => !v)}
                                className="w-full btn bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 mb-4"
                            >
                                {showUploadLogs ? 'Hide Logs' : 'Show Logs'}
                            </button>
                        )}

                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="text-slate-500 dark:text-slate-400">Total Records</span>
                                <span className="font-bold text-slate-800 dark:text-white">{log.totalRecords}</span>
                            </div>
                            <div className="flex justify-between items-center p-3 bg-green-900/20 rounded-lg border border-green-900/50">
                                <span className="text-green-400 flex items-center gap-2">
                                    <CheckCircle size={16} /> {log.fileType === 'monthly_update' ? 'Processed' : 'Created'}
                                </span>
                                <span className="font-bold text-green-300">{log.successCount}</span>
                            </div>
                            {skippedExisting.length > 0 && (
                                <div className="flex justify-between items-center p-3 bg-blue-900/20 rounded-lg border border-blue-900/50">
                                    <span className="text-blue-400 flex items-center gap-2">
                                        <AlertCircle size={16} /> Already Exist (Skipped)
                                    </span>
                                    <span className="font-bold text-blue-300">{skippedExisting.length}</span>
                                </div>
                            )}
                            {log.failureCount > 0 && (
                                <div className="flex justify-between items-center p-3 bg-red-900/20 rounded-lg border border-red-900/50">
                                    <span className="text-red-400 flex items-center gap-2"><AlertCircle size={16} /> Failed</span>
                                    <span className="font-bold text-red-300">{log.failureCount}</span>
                                </div>
                            )}
                        </div>

                        {/* Send Update Notification — monthly upload only */}
                        {uploadType === 'monthly' && (log || uploadedMonth) && (
                            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                    <Bell size={15} className="text-indigo-500" />
                                    {uploadedMonth
                                        ? <>Notify employees for <span className="font-semibold text-slate-700 dark:text-slate-300">{uploadedMonth}</span>.</>
                                        : 'Notify employees that their monthly data has been updated.'}
                                </p>
                                <button
                                    onClick={handleSendNotification}
                                    disabled={sendingNotification || notificationResult || !uploadedMonth}
                                    title={uploadedMonth ? `Send email notifications for ${uploadedMonth}` : 'Month not detected from upload'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-colors"
                                >
                                    <SendHorizonal size={16} className={sendingNotification ? 'animate-pulse' : ''} />
                                    {sendingNotification
                                        ? 'Sending notifications…'
                                        : notificationResult
                                            ? `✓ Sent to ${notificationResult.sent} employee(s)`
                                            : 'Send Update to Employees'}
                                </button>
                                {notificationResult && (
                                    <div className={`text-xs px-3 py-2 rounded-lg border ${
                                        notificationResult.errors?.length > 0
                                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300'
                                            : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                                    }`}>
                                        <Mail size={13} className="inline mr-1" />
                                        {notificationResult.errors?.length > 0
                                            ? `Sent: ${notificationResult.sent} / ${notificationResult.total} — ${notificationResult.errors.length} delivery failure(s)`
                                            : `Notification delivered to ${notificationResult.sent} employee(s) with a registered email.`
                                        }
                                        {notificationResult.total === 0 && (
                                            <span className="block mt-1 text-slate-500 dark:text-slate-400">
                                                No employees have a registered email address on file.
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* SMS notification */}
                                <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
                                    <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                        <MessageSquare size={15} className="text-green-500" />
                                        Send SMS to employees with a registered phone number.
                                    </p>
                                    <button
                                        onClick={handleSendSms}
                                        disabled={sendingSms || !!smsResult || !uploadedMonth}
                                        title={uploadedMonth ? `Send SMS for ${uploadedMonth}` : 'Month not detected from upload'}
                                        className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-base transition-colors"
                                    >
                                        <MessageSquare size={18} className={sendingSms ? 'animate-pulse' : ''} />
                                        {sendingSms
                                            ? 'Sending SMS…'
                                            : smsResult
                                                ? `✓ SMS sent to ${smsResult.sent} employee(s)`
                                                : 'Send SMS Update to Employees'}
                                    </button>
                                    {smsResult && (
                                        <div className={`text-xs px-3 py-2 rounded-lg border ${
                                            smsResult.errors?.length > 0
                                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300'
                                                : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                                        }`}>
                                            <MessageSquare size={13} className="inline mr-1" />
                                            {smsResult.errors?.length > 0
                                                ? `Sent: ${smsResult.sent} / ${smsResult.total} — ${smsResult.errors.length} delivery failure(s)`
                                                : `SMS delivered to ${smsResult.sent} employee(s) with a registered phone.`
                                            }
                                            {smsResult.total === 0 && (
                                                <span className="block mt-1 text-slate-500 dark:text-slate-400">
                                                    No employees have a registered phone number on file.
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* When all employees already exist — offer to regenerate credentials */}
                        {uploadType === 'employees' && skippedExisting.length > 0 && (!createdUsers || createdUsers.length === 0) && (
                            <div className="mt-6 pt-6 border-t border-slate-700 space-y-3">
                                <div className="flex items-start gap-2 text-sm px-3 py-2 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300">
                                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                                    All employees already exist — no new credentials were generated. You can reset &amp; re-download credentials for all employees below.
                                </div>
                                <button
                                    onClick={handleRegenerateCredentials}
                                    disabled={regenerating}
                                    className="w-full btn bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center gap-2"
                                >
                                    <RefreshCw size={16} className={regenerating ? 'animate-spin' : ''} />
                                    {regenerating ? 'Resetting passwords…' : 'Reset & Download All Credentials (CSV)'}
                                </button>
                                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                    ⚠️ This resets passwords for all employees. Share the CSV with them.
                                </p>
                            </div>
                        )}

                        {createdUsers && createdUsers.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
                                {/* Email status badge */}
                                {emailsSent != null && (
                                    <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
                                        emailErrors.length > 0
                                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300'
                                            : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                                    }`}>
                                        <Mail size={15} />
                                        {emailErrors.length === 0
                                            ? `Credentials emailed to admin inbox & ${createdUsers.filter(u => u.email).length} employee(s) with registered email`
                                            : `Email sent with ${emailErrors.length} delivery failure(s) — check SMTP config`
                                        }
                                    </div>
                                )}
                                <button
                                    onClick={downloadCredentials}
                                    className="w-full btn bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2"
                                >
                                    <SendHorizonal size={16} />
                                    Download Login Credentials (CSV)
                                </button>
                                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                    A copy was also sent to the admin inbox automatically.
                                </p>
                            </div>
                        )}

                        {showUploadLogs && log.errorLog && log.errorLog.length > 0 && (
                            <div className="mt-6">
                                <h4 className="font-bold text-red-400 mb-2 text-sm">Error Log (Rows Skipped)</h4>
                                <div className="max-h-40 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 rounded text-xs text-red-600 dark:text-red-300 font-mono">
                                    {log.errorLog.map((err, i) => (
                                        <div key={i}>Row {err.row}: {err.error}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {showUploadLogs && skippedExisting.length > 0 && (
                            <div className="mt-6">
                                <h4 className="font-bold text-blue-400 mb-2 text-sm flex items-center gap-2">
                                    <AlertCircle size={14} /> Already Existing Employees ({skippedExisting.length})
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                    These employees were skipped because they already exist in the system:
                                </p>
                                <div className="max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 rounded border border-blue-300 dark:border-blue-900/50">
                                    <table className="w-full text-xs text-left">
                                        <thead className="text-blue-600 dark:text-blue-400 border-b border-blue-200 dark:border-blue-900/50">
                                            <tr>
                                                <th className="pb-1 pr-3">Row</th>
                                                <th className="pb-1 pr-3">Name</th>
                                                <th className="pb-1">Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-blue-800 dark:text-blue-300 font-mono">
                                            {skippedExisting.map((s, i) => (
                                                <tr key={i} className="border-b border-slate-200 dark:border-slate-800">
                                                    <td className="py-1 pr-3">{s.row}</td>
                                                    <td className="py-1 pr-3">{s.name}</td>
                                                    <td className="py-1">{s.reason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {showUploadLogs && warnings.length > 0 && (
                            <div className="mt-6">
                                <h4 className="font-bold text-yellow-400 mb-2 text-sm flex items-center gap-2">
                                    <AlertCircle size={14} /> Data Mismatch Warnings ({warnings.length})
                                </h4>
                                <p className="text-xs text-slate-400 mb-2">
                                    These rows were still processed, but some fields had issues:
                                </p>
                                <div className="max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 rounded border border-yellow-300 dark:border-yellow-900/50">
                                    <table className="w-full text-xs text-left">
                                        <thead className="text-yellow-500 border-b border-yellow-900/50">
                                            <tr>
                                                <th className="pb-1 pr-3">Row</th>
                                                <th className="pb-1 pr-3">Column</th>
                                                <th className="pb-1">Issue</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-yellow-300 font-mono">
                                            {warnings.map((w, i) => (
                                                <tr key={i} className="border-b border-slate-800">
                                                    <td className="py-1 pr-3">{w.row}</td>
                                                    <td className="py-1 pr-3">{w.column}</td>
                                                    <td className="py-1">{w.issue}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Column Detection Summary (monthly only) */}
                        {showUploadLogs && columnSummary && (
                            <div className="mt-6">
                                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2 text-sm flex items-center gap-2">
                                    <CheckCircle size={14} className="text-indigo-500" /> Column Detection
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                    Green = detected in your Excel &nbsp;|&nbsp; Red = not found (data will be 0 for that field)
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(columnSummary).map(([field, col]) => (
                                        <span key={field} className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                                            col
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                                                : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800'
                                        }`}>
                                            {col ? `✓ ${field}: ${col}` : `✗ ${field}`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default Upload;


