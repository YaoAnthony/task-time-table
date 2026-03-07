import React, { useEffect } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { message } from 'antd';
import { FaCogs } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';
import { setSelectedSystemId } from '../../../../Redux/Features/systemSlice';
import SystemManagement from '../SystemManagement';

/**
 * SystemRouter - 根据用户权限路由到正确的系统界面
 * - Owner: 显示 SystemManagement（管理界面）
 * - Member: 显示子路由 Outlet（使用界面）
 */
const SystemRouter: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    
    const systems = useSelector((state: RootState) => state.system.systems);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();

    useEffect(() => {
        if (!systemId) {
            message.error('系统ID缺失');
            navigate('/dashboard/setting');
            return;
        }
        
        // 如果系统列表为空，尝试加载
        if (systems.length === 0) {
            triggerGetSystemList();
        }

        if (systemId) {
            dispatch(setSelectedSystemId(systemId));
        }
    }, [systemId, systems.length, triggerGetSystemList, navigate, dispatch]);

    const currentSystem = systems.find(sys => sys._id === systemId);

    // 加载中状态
    if (!currentSystem) {
        return (
            <section className="w-full h-[85vh] flex items-center justify-center text-white bg-black/60 rounded-2xl border border-white/10">
                <div className="text-center">
                    <FaCogs className="text-6xl mb-4 opacity-30 mx-auto animate-spin" />
                    <p className="tracking-widest text-white/50">系统加载中...</p>
                </div>
            </section>
        );
    }

    // 判断用户是否是系统的创建者（owner）
    const isOwner = currentSystem.profile === profile?._id;

    // 根据权限显示不同的组件
    if (isOwner) {
        return <SystemManagement />;
    } else {
        // 成员显示子路由
        return <Outlet />;
    }
};

export default SystemRouter;
