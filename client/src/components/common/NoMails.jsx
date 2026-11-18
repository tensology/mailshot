const NoMails = ({ message }) => {
    const title = message?.heading || 'No messages to show';
    const subtitle = message?.subHeading || '';

    return (
        <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-2xl">
                ✉️
            </div>
            <h2 className="text-lg font-medium text-slate-800 dark:text-slate-100">{title}</h2>
            {subtitle && <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
    );
};

export default NoMails;
