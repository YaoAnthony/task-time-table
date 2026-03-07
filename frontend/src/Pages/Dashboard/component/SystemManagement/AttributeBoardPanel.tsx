import { motion } from "motion/react";


import { FaChartBar } from 'react-icons/fa';

const AttributeBoardPanel: React.FC<{ systemId: string }> = () => {
    return (
        <div className="p-8 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="max-w-4xl">
                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 mb-6 shadow-sm dark:shadow-none">
                    <h3 className="text-lg font-bold tracking-widest mb-2 text-blue-500 dark:text-[#FFC72C]">属性板管理</h3>
                    <p className="text-sm text-gray-500 dark:text-white/50 mb-4">配置此系统中宿主的属性维度（体力、力量、智慧等）</p>
                    <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="bg-blue-500 hover:bg-blue-600 dark:bg-[#FFC72C] dark:hover:bg-white text-white dark:text-black px-6 py-2 rounded-lg font-bold tracking-widest transition-colors shadow-sm dark:shadow-none"
                    >
                        + 添加属性维度
                    </motion.button>
                </div>

                <div className="text-center py-12 text-gray-400 dark:text-white/30 bg-white/30 dark:bg-transparent rounded-xl border border-dashed border-gray-300 dark:border-white/10">
                    <FaChartBar className="text-5xl mb-4 opacity-30 mx-auto" />
                    <p className="tracking-widest">暂无属性配置，请添加</p>
                </div>
            </div>
        </div>
    );
};

export default AttributeBoardPanel;