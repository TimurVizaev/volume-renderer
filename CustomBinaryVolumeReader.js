import { Volume } from '/Volume.js'

const InitialSkipBytes = 3;

class CustomBinaryVolumeReader {
    Load(file, onStart, onLoad, onError) {
        var reader = new FileReader();
        reader.readAsArrayBuffer(file);

        reader.onloadstart = onStart;
        reader.onerror = onError;

        reader.onload = readerEvent => {
            var content = readerEvent.target.result;

            let fileSizeInBytes = content.byteLength;
            //console.log('File Size ' + fileSizeInBytes  + ' (bytes)');

            content = content.slice(InitialSkipBytes, content.byteLength - InitialSkipBytes);
            var volume = this.Parse(content);

            onLoad(volume);
        }
    }

    Parse(data) {
        var header = this.ReadHeader(data);

        var volumeData = data.slice(141 * 2 + 1, data.byteLength - header.DataStartPosition - 1);

        let bytesPerValue = 2; //uint16

        let sizeInBytesShouldBe = header.XSize * header.YSize * header.ZSize * bytesPerValue;
        //console.log('Size should be ' + sizeInBytesShouldBe + ' (bytes)');

        let sizeInBytesIs = volumeData.byteLength;
        //console.log('Size is ' + sizeInBytesIs + ' (bytes)');

        var shorts = new Uint16Array(volumeData);

        var floats = new Float32Array(shorts.length);
        let min = Number.MAX_VALUE;
        let max = -Number.MAX_VALUE;

        for (var i = 0; i < shorts.length; i++) {
            let f = (shorts[i] >= 0x8000) ? -(0x10000 - shorts[i]) / 0x8000 : shorts[i] / 0x7FFF; //no comments...
            f = f * 20.0; //TODO: use vEnc
            floats[i] = f;

            if (f < min) { min = f; }
            if (f > max) { max = f; }
        }


        var volume = new Volume();
        volume.type = 'float';
        //volume.type = 'uint16';
        volume.data = floats;
        //volume.data = shorts;
        volume.xLength = header.XSize;
        volume.yLength = header.YSize;
        volume.zLength = header.ZSize;

        volume.min = min;
        volume.max = max;

        return volume;
    }

    ReadHeader(data) {
        let header = {};

        let headerSize = 1000;
        var peekArray = new Uint16Array(data.slice(0, headerSize));
        let labels = [];
        let currentLabelArray = [];
        var isLabel = true;
        let startPos = 0; //pos of first label
        let dataStartPos = 141; //default value


        for (var i = startPos; i < peekArray.length; i++) {
            let value = peekArray[i];
            if (value == 58) //:
            {
                var currentLabel = currentLabelArray.join("");
                isLabel = !isLabel;
                labels.push(currentLabel);

                let labelValue = 0;

                if (currentLabel == "HeaderSize") {
                    i++; i++; //header size is a 64bit int, so we skip 2 16bit ints
                    let first = peekArray[++i];
                    let second = peekArray[++i];
                    labelValue = second << 16 | first;
                    dataStartPos = labelValue / 2 + 24 / 2;
                }
                //else if(currentLabel == "VolumeData")
                //{
                //    dataStartPos = i;
                //    console.log('VolumeData starts at ' + dataStartPos);
                //    break;
                //}
                else {
                    let first = peekArray[++i];
                    let second = peekArray[++i];
                    labelValue = first;
                    if (first == 0) {
                        labelValue = first << 16 | second;
                    }
                    i++;
                }

                header[currentLabel] = labelValue;
                //console.log('Adding label ' + currentLabel + ' with value ' + labelValue);
                currentLabelArray = [];
            }
            else if (value >= 32 && value <= 126) //printable chars
            {
                currentLabelArray.push(String.fromCharCode(value));
            }
        }

        header.DataStartPosition = dataStartPos;

        return header;
    }

}


export { CustomBinaryVolumeReader }