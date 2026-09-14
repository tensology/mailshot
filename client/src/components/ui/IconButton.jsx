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
            className={`inline-flex items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 ${sizeClass} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};

export default IconButton;
