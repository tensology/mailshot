const Spinner = ({ size = 24, className = '' }) => (
    <span
        className={`inline-block animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 ${className}`}
        style={{ width: size, height: size }}
        role="status"
        aria-label="Loading"
    />
);

export default Spinner;
