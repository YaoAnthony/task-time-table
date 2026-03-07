import os

def update_backpack():
    file_path = r"c:\my folder\HTML CODE\time plan\frontend\src\Pages\Dashboard\component\Backpack\index.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    replacements = {
        'case \'mission\': return <FaScroll className="text-blue-400" />': 'case \'mission\': return <FaScroll className="text-blue-500 dark:text-blue-400" />',
        'case \'lottery_chance\': return <FaDice className="text-purple-400" />': 'case \'lottery_chance\': return <FaDice className="text-purple-500 dark:text-purple-400" />',
        'case \'consumable\': return <FaFlask className="text-green-400" />': 'case \'consumable\': return <FaFlask className="text-green-500 dark:text-green-400" />',
        'default: return <FaBox className="text-gray-300" />': 'default: return <FaBox className="text-gray-400 dark:text-gray-300" />',
        'rounded-2xl border border-white/10 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-hidden text-white font-sans': 'rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/70 dark:bg-black/60 shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-hidden text-neutral-800 dark:text-white font-sans',
        'border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent': 'border-b border-neutral-200 dark:border-white/10 bg-gradient-to-r from-neutral-100 dark:from-white/5 to-transparent',
        'filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]': 'filter drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]',
        'bg-black/40 px-4 py-1.5 rounded-full border border-yellow-500/30': 'bg-white dark:bg-black/40 px-4 py-1.5 rounded-full border border-yellow-400/50 dark:border-yellow-500/30 shadow-sm',
        'text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]': 'text-yellow-500 dark:text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)] dark:drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]',
        'text-yellow-400 font-bold font-mono tracking-wider': 'text-yellow-600 dark:text-yellow-400 font-bold font-mono tracking-wider',
        'border-r border-white/10 relative': 'border-r border-neutral-200 dark:border-white/10 relative',
        'border-b border-white/5': 'border-b border-neutral-200 dark:border-white/5',
        'text-[#FFC72C] border-b-2 border-[#FFC72C] drop-shadow-[0_0_8px_rgba(255,199,44,0.6)] font-bold': 'text-yellow-600 dark:text-[#FFC72C] border-b-2 border-yellow-500 dark:border-[#FFC72C] drop-shadow-[0_0_8px_rgba(255,199,44,0.3)] dark:drop-shadow-[0_0_8px_rgba(255,199,44,0.6)] font-bold',
        'text-white/60 hover:text-white/90': 'text-neutral-500 dark:text-white/60 hover:text-neutral-800 dark:hover:text-white/90',
        'scrollbar-thumb-white/20': 'scrollbar-thumb-neutral-300 dark:scrollbar-thumb-white/20',
        'bg-gradient-to-br from-gray-800 to-gray-900 cursor-pointer hover:border-white/50 border-2 shadow-inner border-[#FFC72C] shadow-[0_0_15px_rgba(255,199,44,0.4)]': 'bg-neutral-50 hover:bg-white dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 cursor-pointer hover:border-neutral-400 dark:hover:border-white/50 border-2 shadow-inner border-yellow-500 dark:border-[#FFC72C] shadow-[0_0_15px_rgba(255,199,44,0.3)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)]',
        'bg-gradient-to-br from-gray-800 to-gray-900 cursor-pointer hover:border-white/50 border-2 shadow-inner border-gray-700/50': 'bg-neutral-50 hover:bg-white dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 cursor-pointer hover:border-neutral-400 dark:hover:border-white/50 border-2 shadow-inner border-neutral-200 dark:border-gray-700/50',
        'bg-black/40 border border-white/5': 'bg-neutral-100 dark:bg-black/40 border border-neutral-200 dark:border-white/5',
        'text-3xl filter drop-shadow-md': 'text-3xl filter drop-shadow-sm dark:drop-shadow-md',
        'bg-black/80 px-1.5 rounded text-white/90 border border-white/10': 'bg-neutral-800 px-1.5 rounded text-white border border-neutral-600 dark:bg-black/80 dark:text-white/90 dark:border-white/10',
        'bg-black/20 flex-col relative shrink-0 hidden md:flex': 'bg-neutral-50/80 dark:bg-black/20 flex-col relative shrink-0 hidden md:flex',
        'bg-gradient-to-b from-white/10 to-transparent rounded-xl border border-white/10': 'bg-gradient-to-b from-neutral-200 dark:from-white/10 to-transparent rounded-xl border border-neutral-200 dark:border-white/10',
        'text-7xl filter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]': 'text-7xl filter drop-shadow-md dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]',
        'text-2xl font-bold text-[#FFC72C] tracking-wider mb-2 drop-shadow-sm': 'text-2xl font-bold text-yellow-600 dark:text-[#FFC72C] tracking-wider mb-2 drop-shadow-sm',
        'text-xs font-bold uppercase tracking-widest text-white/50 border-b border-white/10 pb-2': 'text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-white/50 border-b border-neutral-200 dark:border-white/10 pb-2',
        'text-white/80 leading-relaxed text-sm tracking-wide': 'text-neutral-700 dark:text-white/80 leading-relaxed text-sm tracking-wide',
        'bg-[#FFE066] hover:bg-white text-black px-10 py-2 rounded font-bold tracking-[0.2em] shadow-[0_0_15px_rgba(255,199,44,0.4)]': 'bg-[#FFC72C] hover:bg-yellow-400 dark:bg-[#FFE066] dark:hover:bg-white text-black px-10 py-2 rounded font-bold tracking-[0.2em] shadow-[0_0_15px_rgba(255,199,44,0.4)]',
        'text-white/20 p-6 text-center': 'text-neutral-400 dark:text-white/20 p-6 text-center',
        'bg-gray-900 border-t border-white/10': 'bg-white dark:bg-gray-900 border-t border-neutral-200 dark:border-white/10',
        'font-bold text-[#FFC72C] text-sm': 'font-bold text-yellow-600 dark:text-[#FFC72C] text-sm',
        'text-xs text-white/50': 'text-xs text-neutral-500 dark:text-white/50',
        'bg-[#FFE066] hover:bg-white text-black px-6 py-2 rounded text-sm font-bold shadow-[0_0_10px_rgba(255,199,44,0.4)]': 'bg-[#FFC72C] dark:bg-[#FFE066] hover:bg-yellow-400 dark:hover:bg-white text-black px-6 py-2 rounded text-sm font-bold shadow-[0_0_10px_rgba(255,199,44,0.4)]'
    }

    for old, new in replacements.items():
        content = content.replace(old, new)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

def update_setting():
    file_path = r"c:\my folder\HTML CODE\time plan\frontend\src\Pages\Dashboard\component\Setting\index.tsx"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    replacements = {
        'rounded-2xl border border-white/10 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-hidden text-white font-sans': 'rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/70 dark:bg-black/60 shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-hidden text-neutral-800 dark:text-white font-sans',
        'border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent': 'border-b border-neutral-200 dark:border-white/10 bg-gradient-to-r from-neutral-100 dark:from-white/5 to-transparent',
        'filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]': 'filter drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]',
        'gap-2 bg-red-500/80 hover:bg-red-500 text-white px-5 py-2 rounded font-bold shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all tracking-widest border border-red-400/50': 'gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/80 dark:hover:bg-red-500 text-red-600 dark:text-white px-5 py-2 rounded font-bold shadow-sm dark:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all tracking-widest border border-red-200 dark:border-red-400/50',
        'border-b border-white/5 gap-4': 'border-b border-neutral-200 dark:border-white/5 gap-4',
        'text-white/40': 'text-neutral-400 dark:text-white/40',
        'bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#FFC72C]': 'bg-white dark:bg-black/40 border border-neutral-300 dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-neutral-800 dark:text-white/90 placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:outline-none focus:border-yellow-500 dark:focus:border-[#FFC72C]',
        'bg-white/10 hover:bg-white/20 border border-white/20': 'bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/20 border border-neutral-300 dark:border-white/20',
        'text-[#FFC72C]': 'text-yellow-600 dark:text-[#FFC72C]',
        'scrollbar-thumb-white/20': 'scrollbar-thumb-neutral-300 dark:scrollbar-thumb-white/20',
        'bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700/50 rounded-xl overflow-hidden hover:border-[#FFC72C] hover:shadow-[0_0_15px_rgba(255,199,44,0.3)]': 'bg-white dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 border border-neutral-200 dark:border-gray-700/50 rounded-xl overflow-hidden shadow-sm hover:border-yellow-400 dark:hover:border-[#FFC72C] hover:shadow-md dark:hover:shadow-[0_0_15px_rgba(255,199,44,0.3)]',
        'bg-black/40 flex items-center justify-center border border-white/10 group-hover:border-[#FFC72C]/50': 'bg-neutral-100 dark:bg-black/40 flex items-center justify-center border border-neutral-200 dark:border-white/10 group-hover:border-yellow-400 dark:group-hover:border-[#FFC72C]/50',
        'text-white/70 group-hover:text-[#FFC72C]': 'text-neutral-500 dark:text-white/70 group-hover:text-yellow-600 dark:group-hover:text-[#FFC72C]',
        'text-white/60 text-sm': 'text-neutral-500 dark:text-white/60 text-sm',
        'bg-blue-500/20 text-blue-300 border border-blue-500/30': 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30',
        'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30': 'bg-yellow-50 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-500/30',
        'bg-purple-500/20 text-purple-300 border border-purple-500/30': 'bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30',
        'bg-white/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-[#FFC72C]/10': 'bg-yellow-100/50 dark:bg-white/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-yellow-200/50 dark:group-hover:bg-[#FFC72C]/10',
        'text-white/30': 'text-neutral-400 dark:text-white/30',
        'w-full md:w-96 bg-black/50 border-l border-white/10 shrink-0 absolute md:relative inset-y-0 right-0 z-20 flex flex-col backdrop-blur-xl': 'w-full md:w-96 bg-white dark:bg-black/80 border-l border-neutral-200 dark:border-white/10 shrink-0 absolute md:relative inset-y-0 right-0 z-20 flex flex-col shadow-2xl dark:shadow-none backdrop-blur-xl',
        'border-b border-white/10 flex justify-between': 'border-b border-neutral-200 dark:border-white/10 flex justify-between',
        'text-white/50 hover:text-white': 'text-neutral-400 hover:text-neutral-600 dark:text-white/50 dark:hover:text-white',
        'bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-white/30 focus:border-[#FFC72C] layout-none': 'bg-neutral-50 dark:bg-black/40 border border-neutral-300 dark:border-white/10 rounded-lg px-4 py-2 text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-yellow-500 dark:focus:border-[#FFC72C]',
        'bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-white/30 focus:border-[#FFC72C] outline-none': 'bg-neutral-50 dark:bg-black/40 border border-neutral-300 dark:border-white/10 rounded-lg px-4 py-2 text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-yellow-500 dark:focus:border-[#FFC72C] outline-none',
        'border-t border-white/10': 'border-t border-neutral-200 dark:border-white/10',
        'border border-white/30 flex items-center justify-center bg-black/40 group-hover:border-[#FFC72C]': 'border border-neutral-300 dark:border-white/30 flex items-center justify-center bg-neutral-50 dark:bg-black/40 group-hover:border-yellow-500 dark:group-hover:border-[#FFC72C]',
        'bg-[#FFC72C]': 'bg-yellow-500 dark:bg-[#FFC72C]',
        'text-blue-400': 'text-blue-500 dark:text-blue-400',
        'text-yellow-400': 'text-yellow-500 dark:text-yellow-400',
        'text-purple-400': 'text-purple-500 dark:text-purple-400',
        'bg-black/20': 'bg-neutral-50 dark:bg-black/20',
        'bg-[#FFE066] hover:bg-white text-black py-3 rounded text-lg font-bold tracking-[0.2em] shadow-[0_0_15px_rgba(255,199,44,0.3)]': 'bg-[#FFC72C] dark:bg-[#FFE066] hover:bg-yellow-400 dark:hover:bg-white text-black py-3 rounded text-lg font-bold tracking-[0.2em] shadow-md dark:shadow-[0_0_15px_rgba(255,199,44,0.3)]',
        'text-white/60': 'text-neutral-600 dark:text-white/60',
        '<span className="hidden sm:inline">创造新系统</span>': '<span className="hidden sm:inline text-neutral-700 dark:text-white">创造新系统</span>'
    }

    for old, new in replacements.items():
        content = content.replace(old, new)

    # Some missed plain text-white replacements in specific spots contextually
    content = content.replace('<span className="tracking-widest flex items-center gap-2">', '<span className="tracking-widest flex items-center gap-2 text-neutral-700 dark:text-white">')

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    update_backpack()
    update_setting()
