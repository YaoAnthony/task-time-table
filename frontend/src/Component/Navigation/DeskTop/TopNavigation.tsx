import { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { useSelector } from "react-redux";
import { Tooltip } from "antd";
import { FaUserCircle } from 'react-icons/fa';

// types
import { RootState } from "../../../Redux/store";
// auth modal
import { useAuthModal } from "../../../Features/Authentication/component/ModalAuthContext";
// components
import DropDownBar from "./DropDownBar";
import DarkLightSwitch from "../../DarkLightSwitch";
import ShowIcon from "../../ShowIcon";

const DeskTopNav = () => {
  const [isOpen, setIsOpen] = useState(false);

  const isAuthenticated = useSelector((state: RootState) => state.user.isLoggedIn);
  const { user } = useSelector((state: RootState) => state.user);
  const { showAuthModal } = useAuthModal();

  return (
    <nav className="hidden md:flex w-full items-center justify-between px-8 xl:px-16">
      <div className="flex items-center gap-10 xl:gap-14">
          {/* Logo */}
          <NavLink to="/" className="flex items-end gap-1 shrink-0 cursor-pointer group hover:opacity-90 transition-opacity">
               <div className="text-4xl font-black text-white tracking-widest filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                   幻星<span className="text-[#FFC72C] group-hover:text-yellow-300 transition-colors">纪元</span>
               </div>
          </NavLink>
      </div>

      {/* Auth / Right Side */}
      <div className="flex items-center justify-end gap-6 mt-1">
        <DarkLightSwitch />
        <ShowIcon />
        {isAuthenticated ? (
          <Tooltip
            placement="bottomRight"
            color="white"
            onOpenChange={() => setIsOpen(false)}
            fresh={true}
            title={<DropDownBar />}
            styles={{
              root: { whiteSpace: "normal", maxWidth: "none", padding: 0 },
            }}
          >
            <div
              onClick={() => setIsOpen(!isOpen)}
              className="flex gap-2 items-center tracking-wide cursor-pointer"
            >
              <div onMouseEnter={() => setIsOpen(true)} className="flex items-center gap-2 select-none">
                <img
                  src={user?.image_url || 'https://placehold.co/150x150/1e1e2f/06b6d4.png?text=User'}
                  alt="avatar"
                  className="w-10 h-10 rounded-full border-2 border-white/80 hover:border-[#FFC72C] transition-colors shadow-lg"
                />
              </div>
            </div>
          </Tooltip>
        ) : (
          <motion.button 
              onClick={() => showAuthModal()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-white hover:text-[#FFC72C] transition-colors py-2 px-3 group mr-4"
          >
              <div className="bg-black/40 p-1.5 rounded-full border border-white/20 backdrop-blur-sm group-hover:border-[#FFC72C]/50 transition-colors">
                  <FaUserCircle className="text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" />
              </div>
              <span className="tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-[15px] font-bold">登入</span>
          </motion.button>
        )}

      </div>
    </nav>
  );
};

export default DeskTopNav;
