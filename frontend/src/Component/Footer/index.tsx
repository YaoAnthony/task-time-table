import {
    MailOutlined,
    TwitterOutlined,
    GithubOutlined,
    LinkedinOutlined, 
} from "@ant-design/icons";
import { styles } from "../../style";
import { APPNAME } from "../../Constant";

const Footer = () => {
    const socials = [
        { icon: <MailOutlined />, link: "mailto:contact@example.com" },
        { icon: <TwitterOutlined />, link: "https://twitter.com" },
        { icon: <GithubOutlined />, link: "https://github.com" },
        { icon: <LinkedinOutlined />, link: "https://linkedin.com" },
    ];

    return (
        <footer className={`${styles.paddingX} py-10 border-t border-gray-200 dark:border-white/10 transition-colors duration-300`}>
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                
                {/* Brand & Copyright */}
                <div className="flex flex-col md:items-start items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                        {APPNAME}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        © {new Date().getFullYear()} {APPNAME}. All rights reserved.
                    </p>
                </div>


                {/* Socials */}
                <div className="flex gap-4">
                    {socials.map((social, index) => (
                        <a
                            key={index}
                            href={social.link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors duration-200"
                        >
                            {social.icon}
                        </a>
                    ))}
                </div>
            </div>
        </footer>
    );
};

export default Footer;
