const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100'
};

const sizes = {
    sm: 'h-8 px-3 text-sm rounded-lg',
    md: 'h-10 px-4 text-sm rounded-xl',
    lg: 'h-11 px-5 text-base rounded-xl'
};

const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    type = 'button',
    disabled = false,
    ...props
}) => (
    <button
        type={type}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
    >
        {children}
    </button>
);

export default Button;
