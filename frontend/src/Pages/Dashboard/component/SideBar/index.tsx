import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../../Redux/store";

//icons
import { 
    GiftOutlined
    
} from '@ant-design/icons';

// component
import { Link, useLocation } from "react-router-dom";

import { sidebarItems } from "../../constants";



import Companion3D from "../Companion3D";




const SideBar: React.FC = () => {
    const location = useLocation();
    const selectedSystemId = useSelector((state: RootState) => state.system.selectedSystemId);
    const systems = useSelector((state: RootState) => state.system.systems);

    const selectedSystem = systems.find((item) => item._id === selectedSystemId);

    const allItems = [
        ...sidebarItems,
        ...(selectedSystemId && selectedSystem?.modules?.lottery
            ? [{ label: "祈愿卡池", path: `/dashboard/system/${selectedSystemId}/lottery`, icon: <GiftOutlined /> }]
            : []),
    ];

    return (
        <aside className="relative flex flex-col h-[85vh] w-[240px] rounded-2xl overflow-hidden
            bg-white/40 dark:bg-black/40 border border-white/60 dark:border-white/10 
            shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.1)] 
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)] 
            backdrop-blur-xl transition-all duration-300 z-10"
        >
            {/* HUD Top Tech Pattern (Decor) */}
            <div className="h-8 w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz4KPC9zdmc+')] opacity-50 dark:opacity-30 border-b border-white/20 dark:border-white/5" />

            <nav className="flex-1 flex flex-col gap-2 p-4 pt-6 z-10">
                {allItems.map(item => {
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`group relative flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 text-sm font-bold tracking-widest overflow-hidden
                            ${isActive 
                                ? "text-blue-600 dark:text-[#FFC72C] bg-white/60 dark:bg-white/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.05),_0_4px_10px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_0_10px_rgba(255,199,44,0.1)] border border-white/80 dark:border-[#FFC72C]/30" 
                                : "text-neutral-500 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 border border-transparent hover:border-white/50 dark:hover:border-white/10"
                            }`}
                        >
                            {/* Active Sci-Fi Indicator Bar */}
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 rounded-r-full bg-blue-500 dark:bg-[#FFC72C] shadow-[0_0_10px_rgba(59,130,246,0.8)] dark:shadow-[0_0_10px_rgba(255,199,44,0.8)]" />
                            )}
                            
                            {/* Hover Neon Sweep Effect */}
                            <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent transition-transform duration-700 pointer-events-none" />

                            <span className={`text-xl transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-[0_0_5px_currentColor]' : 'group-hover:scale-110'}`}>
                                {item.icon}
                            </span>
                            <span className="relative z-10">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* 3D Companion Robot Container */}
            <div className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 w-[200px] h-[200px] opacity-90 hover:opacity-100 transition-opacity z-0 drop-shadow-[0_0_15px_rgba(0,243,255,0.4)] mix-blend-screen dark:mix-blend-normal">
                 {/* 3D Component will be lazily loaded or injected here. For now, we import and render it */}
                 <Companion3D />
            </div>

             {/* Bottom decorative bar */}
             <div className="h-1 w-full bg-gradient-to-r from-transparent via-blue-400/50 dark:via-[#FFC72C]/50 to-transparent mt-auto z-10 relative bottom-0" />
        </aside>
    );
};

export default SideBar;