import os
import sys

# Define the files to extract here. 
# I have added the core simulator files. 
# PLEASE ADD or UPDATE the exact paths to your "chat simulator agent" files below.
FILES_TO_EXTRACT = [
    # --- Backend Files ---
    "src/api/simulator.py",
    "src/engine/broker_sim.py",
    # Add backend chat agent files here (e.g., "src/api/chat_agent.py")
    
    
    # --- Frontend Files ---
    "src/components/Portfolio/SimulatorPanel.jsx",
    # Add frontend chat UI files here (e.g., "src/components/Chat/ChatPanel.jsx")
    
]

def main(output_file):
    output_content = ""
    extracted_count = 0
    
    for filepath in FILES_TO_EXTRACT:
        # Normalize path for the current OS
        normalized_path = os.path.normpath(filepath)
        
        if os.path.exists(normalized_path) and os.path.isfile(normalized_path):
            try:
                with open(normalized_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                output_content += f"========================================\n"
                output_content += f"FILE: {filepath}\n"
                output_content += f"========================================\n"
                output_content += content + "\n\n"
                print(f"✅ Extracted: {filepath}")
                extracted_count += 1
            except Exception as e:
                print(f"❌ Error reading {filepath}: {e}")
        else:
            print(f"⚠️  Not found (skipping): {filepath}")

    if extracted_count > 0:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(output_content)
        print(f"\nSuccess! {extracted_count} files extracted to '{output_file}'")
    else:
        print("\nNo files were extracted. Please verify the paths in FILES_TO_EXTRACT.")

if __name__ == "__main__":
    # Usage: python extract_files.py [output_filename.txt]
    out_file = sys.argv[1] if len(sys.argv) > 1 else "extracted_sim_files.txt"
    main(out_file)
