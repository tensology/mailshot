import Spinner from '../ui/Spinner';

const SuspenseLoader = () => (
    <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size={28} />
    </div>
);

export default SuspenseLoader;
