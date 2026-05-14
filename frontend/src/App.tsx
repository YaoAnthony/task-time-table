//react
import { lazy, Suspense, useLayoutEffect } from 'react'

//react route dom
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'

//api
import { useGetProfileAndUserQuery } from "./api/profileApi";
//motion
import { AnimatePresence } from 'motion/react';

const MainPage = lazy(() => import('./Pages/MainPage'));
const Dashboard = lazy(() => import('./Pages/Dashboard'));


const Overview = lazy(() => import('./Pages/Dashboard/component/Overview'));
const Backpack = lazy(() => import('./Pages/Dashboard/component/Backpack'));
const Setting = lazy(() => import('./Pages/Dashboard/component/Setting'));
const GameSettings = lazy(() => import('./Pages/Dashboard/component/GameSettings'));
const GameNpcShop = lazy(() => import('./Pages/Dashboard/component/GameNpcShop'));
const NPCData = lazy(() => import('./Pages/Dashboard/component/NPCData'));
const Tasks = lazy(() => import('./Pages/Dashboard/component/Tasks'));
const Store = lazy(() => import('./Pages/Dashboard/component/Store'));
const SystemRouter = lazy(() => import('./Pages/Dashboard/component/SystemRouter'));
const SystemUsage = lazy(() => import('./Pages/Dashboard/component/SystemUsage'));
const SystemStore = lazy(() => import('./Pages/Dashboard/component/SystemStore'));
const SystemTasks = lazy(() => import('./Pages/Dashboard/component/SystemTasks'));
const SystemLottery = lazy(() => import('./Pages/Dashboard/component/SystemLottery'));
const SystemIdleGame = lazy(() => import('./Pages/Dashboard/component/SystemIdleGame'));
const DailyQuests = lazy(() => import('./Pages/Dashboard/component/DailyQuests'));


const LoginRegisterPage = lazy(() => import('./Features/Authentication/pages/LoginRegisterPage'));
const GithubCallback = lazy(() => import('./Features/Authentication/pages/GithubCallback'));
const LoginCallBackPage = lazy(() => import('./Features/Authentication/pages/LoginCallBackPage'));

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
    
    useGetProfileAndUserQuery();
    
    return (
        
        <div className="relative w-full min-h-screen">
            <ScrollToTop />
            
            <AnimatePresence mode="wait">
                <Suspense fallback={null}>
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
                        <Route path="daily-quests" element={<DailyQuests />} />
                        <Route path="store" element={<Store />} />
                        <Route path="setting" element={<Setting />} />
                        <Route path="game-settings" element={<GameSettings />} />
                        <Route path="npc-shop" element={<GameNpcShop />} />
                        <Route path="npc-data" element={<NPCData />} />
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
                </Suspense>
            </AnimatePresence>
        </div>
        
    );
}


export default App;
