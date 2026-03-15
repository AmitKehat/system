import os

TARGET_FILES = [
    "src/api/simulator.py"
]

def main():
    output_file = "backend_extraction.txt"
    with open(output_file, "w", encoding="utf-8") as outfile:
        for path in TARGET_FILES:
            outfile.write(f"--- FILE: {path} ---\n")
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as infile:
                        outfile.write(infile.read() + "\n\n")
                except Exception as e:
                    outfile.write(f"(ERROR READING: {e})\n\n")
            else:
                outfile.write("(NOT FOUND)\n\n")
    print(f"Backend extraction complete! Please upload {output_file}")

if __name__ == "__main__":
    main()
