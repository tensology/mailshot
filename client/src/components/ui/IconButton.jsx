const IconButton = ({
    children,
    className = '',
    label,
    size = 'md',
    ...props
}) => {
    const sizeClass = {
        sm: 'h-8 w-8',
        md: 'h-10 w-10',
        touch: 'h-11 w-11 lg:h-10 lg:w-10'
    }[size] || 'h-10 w-10';

    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={`inline-flex items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 text-slate-600 shadow-sm transition hover:-translate-y-px hover:border-blue-200 hover:from-blue-50 hover:to-white hover:text-blue-700 hover:shadow active:translate-y-0 disabled:opacity-50 ${sizeClass} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};

export default IconButton;
