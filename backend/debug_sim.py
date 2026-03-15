import os

# Files crucial for diagnosing the 404 routing error
TARGETS = [
    "src/api/main.py",
    "src/main.py",          # Checking in case main.py is in the root
    "src/api/simulator.py",
    "src/store/simulatorStore.js",
    "docker-compose.yml"    # To check container port mappings and build paths
]

def main():
    output_filename = "sim_debug_context.txt"
    
    with open(output_filename, "w", encoding="utf-8") as out:
        out.write("==== SIMULATOR 404 DEBUG CONTEXT ====\n\n")
        
        # 1. Extract Target Files
        for path in TARGETS:
            out.write(f"--- PATH: {path} ---\n")
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        out.write(f.read() + "\n\n")
                except Exception as e:
                    out.write(f"(ERROR READING FILE: {e})\n\n")
            else:
                out.write("(FILE NOT FOUND)\n\n")
                
        # 2. Search for any other file named simulator.py just in case it was misplaced
        out.write("--- SEARCHING FOR simulator.py GLOBALLY ---\n")
        found_simulators = []
        for root, dirs, files in os.walk("src"):
            if "simulator.py" in files:
                found_simulators.append(os.path.join(root, "simulator.py"))
        
        if found_simulators:
            for sim_path in found_simulators:
                out.write(f"Found at: {sim_path}\n")
        else:
            out.write("simulator.py not found anywhere in src/!\n")

    print(f"✅ Debug extraction complete. Please upload {output_filename}")

if __name__ == "__main__":
    main()
