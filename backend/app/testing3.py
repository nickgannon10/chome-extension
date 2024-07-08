import os
import subprocess


webm_file_1 = "../uploads/twitter_space_1720422514.webm"
webm_file_2 = "../uploads/twitter_space_1720422520.webm"


mp4_file_1 = "../uploads/intermediate_twitter_space_1.mp4"
mp4_file_2 = "../uploads/intermediate_twitter_space_2.mp4"


concatenated_mp4_file = "../uploads/concatenated_twitter_space.mp4"


output_mp3_file = "../audio/concatenated_twitter_space.mp3"

def extract_ebml_header(webm_file):
    with open(webm_file, 'rb') as f:
        data = f.read()


    return data[:1024]

def prepend_header_to_chunk(header, chunk_file):
    with open(chunk_file, 'rb') as f:
        chunk_data = f.read()


    updated_chunk_data = header + chunk_data

    updated_chunk_file = chunk_file.replace(".webm", "_updated.webm")
    with open(updated_chunk_file, 'wb') as f:
        f.write(updated_chunk_data)

    return updated_chunk_file

def convert_webm_to_mp4(input_file, output_file):
    try:
        command = [
            "ffmpeg", "-i", input_file, "-c:v", "libx264", "-c:a", "aac", output_file
        ]
        subprocess.run(command, check=True)
        print(f"File converted to MP4 successfully and saved to {output_file}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to convert WebM to MP4: {e}")
        raise

def concatenate_mp4_files(file1, file2, output_file):
    try:
        with open("file_list.txt", "w") as f:
            f.write(f"file '{file1}'\n")
            f.write(f"file '{file2}'\n")
        command = [
            "ffmpeg", "-f", "concat", "-safe", "0", "-i", "file_list.txt", "-c", "copy", output_file
        ]
        subprocess.run(command, check=True)
        print(f"Files concatenated successfully and saved to {output_file}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to concatenate files: {e}")
        raise

def extract_audio_from_mp4(mp4_path, mp3_path):
    try:
        command = [
            "ffmpeg", "-i", mp4_path,
            "-vn",
            "-acodec", "libmp3lame",
            mp3_path
        ]
        subprocess.run(command, check=True)
        print(f"Audio extracted successfully and saved to {mp3_path}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to extract audio: {e}")
        raise

if __name__ == "__main__":

    os.makedirs("../uploads", exist_ok=True)
    os.makedirs("../audio", exist_ok=True)

    header = extract_ebml_header(webm_file_1)

    updated_webm_file_2 = prepend_header_to_chunk(header, webm_file_2)

    try:
        convert_webm_to_mp4(webm_file_1, mp4_file_1)
        convert_webm_to_mp4(updated_webm_file_2, mp4_file_2)
    except subprocess.CalledProcessError:
        print("Failed to convert one or more WebM files to MP4. Exiting.")
        exit(1)

    try:
        concatenate_mp4_files(mp4_file_1, mp4_file_2, concatenated_mp4_file)
    except subprocess.CalledProcessError:
        print("Failed to concatenate MP4 files. Exiting.")
        exit(1)

    try:
        extract_audio_from_mp4(concatenated_mp4_file, output_mp3_file)
    except subprocess.CalledProcessError:
        print("Failed to extract audio from the concatenated MP4 file. Exiting.")
        exit(1)