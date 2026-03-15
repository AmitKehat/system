import os

# Files we absolutely need to see to integrate the Simulator Panel, State, and API
TARGET_FILES = [
    "src/App.jsx",
    "src/components/Portfolio/PortfolioSidebar.jsx", # Or whatever your sidebar file is named
    "src/components/Portfolio/ResizableSidebar.jsx", 
    "src/store/statusStore.js",
    "src/store/chartStore.js",
    "src/store/watchlistStore.js",
    "src/components/Chart/MainChart.jsx", # Or your equivalent main chart component
    "src/main.py", # Backend FastAPI entry point
    "requirements.txt"
]

# Additional dynamic search for any other stores or chart components
def find_extra_files():
    extras = []
    for root, dirs, files in os.walk("src"):
        if "node_modules" in root: continue
        for file in files:
            path = os.path.join(root, file).replace("\\", "/")
            if file.endswith("Sidebar.jsx") and path not in TARGET_FILES:
                extras.append(path)
            elif "Chart" in file and path.endswith(".jsx") and path not in TARGET_FILES:
                extras.append(path)
            elif path.endswith("api.py") or path.endswith("router.py"):
                extras.append(path)
    return extras

def main():
    all_targets = TARGET_FILES + find_extra_files()
    output_file = "sim_implementation_context.txt"
    
    with open(output_file, "w", encoding="utf-8") as outfile:
        # 1. Map the directory structure
        outfile.write("================ PROJECT STRUCTURE ================\n")
        for root, dirs, files in os.walk("src"):
            if "node_modules" in root: continue
            level = root.replace("src", "").count(os.sep)
            indent = " " * 4 * (level)
            outfile.write(f"{indent}{os.path.basename(root)}/\n")
            subindent = " " * 4 * (level + 1)
            for f in files:
                if f.endswith(('.js', '.jsx', '.py', '.css')):
                    outfile.write(f"{subindent}{f}\n")
        
        outfile.write("\n================ FILE CONTENTS ================\n\n")
        
        # 2. Extract file contents
        for path in set(all_targets):
            if os.path.exists(path):
                outfile.write(f"--- FILE: {path} ---\n")
                try:
                    with open(path, "r", encoding="utf-8") as infile:
                        outfile.write(infile.read() + "\n\n")
                except Exception as e:
                    outfile.write(f"[Error reading file: {e}]\n\n")
            else:
                outfile.write(f"--- FILE: {path} (NOT FOUND) ---\n\n")

    print(f"Extraction complete! Please upload {output_file} to the chat.")

if __name__ == "__main__":
    main()
