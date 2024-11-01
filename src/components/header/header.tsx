import { BsGithub } from "react-icons/bs";
export default function Header(){
    return (
        <>
        <nav className="flex flex-row items-center justify-between font-mono text-2xl font-bold  text-white">
            <div>
                <i>Dr. Cyborg! ✨
                </i>
            </div>

            <div className="">
                <i className="text-gray-30"><BsGithub className="inline text-2xl"/> github
                </i>
            </div>
        </nav>
        </>
    )
}