//react
import { useLayoutEffect } from 'react'

//react route dom
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'

//api
import { profileApi } from "./api/profileApi";
//redux
import { store } from './Redux/store';
//motion
import { AnimatePresence } from 'motion/react';

//pages
import {
    MainPage,
    Dashboard,
} from './Pages'


// Dashboard
import { 
    Overview,
    Backpack,
    Setting,
    Tasks,
    Store,
    SystemRouter,
    SystemUsage,
    SystemStore,
    SystemTasks,
    SystemLottery,
    SystemIdleGame,
 } from './Pages/Dashboard/component';


//feature page
import { LoginRegisterPage, GithubCallback, LoginCallBackPage } from './Features';

// theme
import { useThemeSync } from './hook/useThemeSync';

// Scroll to the top of the page when the location changes
function ScrollToTop() {
    const location = useLocation();

    useLayoutEffect(() => {
        // Scroll to the top of the page when the location changes
        window.scrollTo(0, 0);
    }, [location]);

  // Return null as this component doesn't render anything
  return null;
}
const App = () => {
    const location = useLocation();

    // 处理主题
    useThemeSync();
    
    store.dispatch(profileApi.endpoints.getProfileAndUser.initiate());
    
    return (
        
        <div className="relative w-full min-h-screen">
            <ScrollToTop />
            
            <AnimatePresence mode="wait">
                
                <Routes location={location} key={location.pathname}>
                    <Route path="/" element={<MainPage />} />

                    <Route path="/login-callback/*" element={<LoginCallBackPage />} />
                    <Route path="/login/*" element={<LoginRegisterPage />} />

                    <Route path="/github-callback" element={<GithubCallback />} />

                    {/* Dashborad */}
                    <Route path="/dashboard" element={<Dashboard />} >
                        <Route index element={<Navigate to="home" />} />
                        <Route path="home" element={<Overview />} />
                        <Route path="backpack" element={<Backpack />} />
                        <Route path="tasks" element={<Tasks />} />
                        <Route path="store" element={<Store />} />
                        <Route path="setting" element={<Setting />} />
                        <Route path="idle-game" element={<SystemIdleGame />} />
                        
                        {/* 系统路由 - 嵌套路由 */}
                        <Route path="system/:systemId" element={<SystemRouter />}>
                            {/* 成员默认路由 - 个人状态页面 */}
                            <Route index element={<SystemUsage />} />
                            {/* 成员功能路由 */}
                            <Route path="store" element={<SystemStore />} />
                            <Route path="lottery" element={<SystemLottery />} />
                            <Route path="tasks" element={<SystemTasks />} />
                        </Route>
                        
                        <Route path="overview" element={<Navigate to="/dashboard/home" replace />} />
                        <Route path="billing" element={<Navigate to="/dashboard/store" replace />} />
                        <Route path="teams" element={<Navigate to="/dashboard/tasks" replace />} />
                    </Route>
                </Routes>
            </AnimatePresence>
        </div>
        
    );
}


export default App;
