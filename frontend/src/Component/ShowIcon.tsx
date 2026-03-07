
import { FaCoins } from 'react-icons/fa';
import { RootState } from '../Redux/store';
import { useSelector } from 'react-redux';

const ShowIcon = () => {

    const profile = useSelector((state: RootState) => state.profile.profile);
    const coins = profile?.wallet?.coins || 0;

    if (!profile) {
        return <></>; // 返回一个占位符
    }
    return ( 
        <div className="flex items-center gap-3 bg-white/60 dark:bg-black/40 px-5 py-2 rounded-full border border-amber-500/30 dark:border-yellow-500/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
            <FaCoins className="text-amber-500 dark:text-yellow-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)] dark:drop-shadow-[0_0_5px_rgba(250,204,21,0.8)] text-lg" />
            <span className="text-amber-600 dark:text-yellow-400 font-black font-mono tracking-wider">{coins.toLocaleString()}</span>
        </div>
    )


}


export default ShowIcon;