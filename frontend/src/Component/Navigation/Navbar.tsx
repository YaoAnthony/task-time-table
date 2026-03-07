import { useState, useEffect } from "react";

//components
import DeskTopNav from "./DeskTop/TopNavigation";
import MobileNav from "./Mobile/MobileNavigation";
import { useLocation } from "react-router-dom";

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false); // 控制滚动状态
  const location = useLocation();
  // Scroll event
  useEffect(() => {
      const handleScroll = () => {
        if (window.scrollY > 50) {
          setIsScrolled(true);
        } else {
          setIsScrolled(false);
        }
      };

      window.addEventListener("scroll", handleScroll);

      return () => {
        window.removeEventListener("scroll", handleScroll);
      };
  }, []);
  const isLoginPage = location.pathname === "/login";
  if (isLoginPage) {
    return (
      <header className="fixed top-0 inset-x-0 z-50 py-5 transition-all duration-500 px-8">
         <div className="flex items-end gap-1 shrink-0 cursor-pointer">
              <div className="text-4xl font-black text-white tracking-widest filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  幻星<span className="text-[#FFC72C]">纪元</span>
              </div>
         </div>
      </header>
    );
  }

  return (
      <header
          className={`fixed top-0 inset-x-0 z-[100] py-3 transition-all duration-500 ${
              isScrolled ? "bg-black/80 backdrop-blur-md border-b border-white/10 shadow-lg" : "bg-transparent"
          }`}
      >
          <DeskTopNav />
          <MobileNav />
      </header>
  );
};

export default Navbar;
