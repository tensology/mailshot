import { forwardRef } from 'react';

const Textarea = forwardRef(({
    className = '',
    label,
    id,
    rows = 4,
    ...props
}, ref) => (
    <label className={`block ${className}`} htmlFor={id}>
        {label && (
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        )}
        <textarea
            ref={ref}
            id={id}
            rows={rows}
            className="w-full resize-y rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
            {...props}
        />
    </label>
));

Textarea.displayName = 'Textarea';

export default Textarea;
