import React, { useState } from 'react';
import { message } from 'antd';
import { FaTrashAlt } from 'react-icons/fa';
import { useDeleteSystemMutation, useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';
import DeleteSystemConfirmModal from './DeleteSystemConfirmModal';

interface DeleteSystemProps {
	systemId: string;
	systemName: string;
	onDeleted: () => void;
}

const DeleteSystem: React.FC<DeleteSystemProps> = ({ systemId, systemName, onDeleted }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [deleteSystem, { isLoading: isDeleting }] = useDeleteSystemMutation();
	const [triggerGetSystemList] = useLazyGetSystemListQuery();

	const handleConfirmDelete = async () => {
		try {
			await deleteSystem({ systemId }).unwrap();
			await triggerGetSystemList().unwrap();
			message.success('系统已删除');
			setIsOpen(false);
			onDeleted();
		} catch (error) {
			const err = error as { data?: { message?: string } };
			message.error(err?.data?.message || '删除系统失败');
		}
	};

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold tracking-widest border transition-all duration-300 shadow-sm hover:shadow-md
				bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300
				dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/20 dark:hover:border-red-500/50"
			>
				<FaTrashAlt />
				<span className="tracking-wider font-semibold">删除系统</span>
			</button>

			<DeleteSystemConfirmModal
				isOpen={isOpen}
				systemName={systemName}
				isDeleting={isDeleting}
				onClose={() => setIsOpen(false)}
				onConfirm={handleConfirmDelete}
			/>
		</>
	);
};

export default DeleteSystem;
