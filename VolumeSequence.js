import { Volume } from "/Volume.js";
class VolumeSequence
{
    constructor(xLength, yLength, zLength)
    {
        this.Volumes = new Array();
        this.xLength = xLength;
        this.yLength = yLength;
        this.zLength = zLength;
    }

    Add(volume)
    {
        this.Volumes.push(volume);

        this.xLength = volume.xLength;
        this.yLength = volume.yLength;
        this.zLength = volume.zLength;
    }


extractPerpendicularPlane(axis, RASIndex)
{
    var iLength,
        jLength,
        sliceAccess,
        planeMatrix = (new Matrix4()).identity(),
        volume = this,
        planeWidth,
        planeHeight,
        firstSpacing,
        secondSpacing,
        positionOffset,
        IJKIndex;

    var axisInIJK = new Vector3(),
        firstDirection = new Vector3(),
        secondDirection = new Vector3();

    var dimensions = new Vector3(this.xLength, this.yLength, this.zLength);


    switch (axis)
    {
        case 'x':
            axisInIJK.set(1, 0, 0);
            firstDirection.set(0, 0, - 1);
            secondDirection.set(0, - 1, 0);
            firstSpacing = this.spacing[2];
            secondSpacing = this.spacing[1];
            IJKIndex = new Vector3(RASIndex, 0, 0);

            planeMatrix.multiply((new Matrix4()).makeRotationY(Math.PI / 2));
            positionOffset = (volume.RASDimensions[0] - 1) / 2;
            planeMatrix.setPosition(new Vector3(RASIndex - positionOffset, 0, 0));
            break;
        case 'y':
            axisInIJK.set(0, 1, 0);
            firstDirection.set(1, 0, 0);
            secondDirection.set(0, 0, 1);
            firstSpacing = this.spacing[0];
            secondSpacing = this.spacing[2];
            IJKIndex = new Vector3(0, RASIndex, 0);

            planeMatrix.multiply((new Matrix4()).makeRotationX(- Math.PI / 2));
            positionOffset = (volume.RASDimensions[1] - 1) / 2;
            planeMatrix.setPosition(new Vector3(0, RASIndex - positionOffset, 0));
            break;
        case 'z':
        default:
            axisInIJK.set(0, 0, 1);
            firstDirection.set(1, 0, 0);
            secondDirection.set(0, - 1, 0);
            firstSpacing = this.spacing[0];
            secondSpacing = this.spacing[1];
            IJKIndex = new Vector3(0, 0, RASIndex);

            positionOffset = (volume.RASDimensions[2] - 1) / 2;
            planeMatrix.setPosition(new Vector3(0, 0, RASIndex - positionOffset));
            break;

    }

    firstDirection.applyMatrix4(volume.inverseMatrix).normalize();
    firstDirection.argVar = 'i';
    secondDirection.applyMatrix4(volume.inverseMatrix).normalize();
    secondDirection.argVar = 'j';
    axisInIJK.applyMatrix4(volume.inverseMatrix).normalize();
    iLength = Math.floor(Math.abs(firstDirection.dot(dimensions)));
    jLength = Math.floor(Math.abs(secondDirection.dot(dimensions)));
    planeWidth = Math.abs(iLength * firstSpacing);
    planeHeight = Math.abs(jLength * secondSpacing);

    IJKIndex = Math.abs(Math.round(IJKIndex.applyMatrix4(volume.inverseMatrix).dot(axisInIJK)));
    var base = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
    var iDirection = [firstDirection, secondDirection, axisInIJK].find(function (x)
    {
        return Math.abs(x.dot(base[0])) > 0.9;
    });
    var jDirection = [firstDirection, secondDirection, axisInIJK].find(function (x)
    {
        return Math.abs(x.dot(base[1])) > 0.9;
    });
    var kDirection = [firstDirection, secondDirection, axisInIJK].find(function (x)
    {
        return Math.abs(x.dot(base[2])) > 0.9;
    });
    var argumentsWithInversion = ['volume.xLength-1-', 'volume.yLength-1-', 'volume.zLength-1-'];
    var argArray = [iDirection, jDirection, kDirection].map(function (direction, n)
    {

        return (direction.dot(base[n]) > 0 ? '' : argumentsWithInversion[n]) + (direction === axisInIJK ? 'IJKIndex' : direction.argVar);

    });
    var argString = argArray.join(',');
    sliceAccess = eval('(function sliceAccess (i,j) {return volume.access( ' + argString + ');})');

    return {
        iLength: iLength,
        jLength: jLength,
        sliceAccess: sliceAccess,
        matrix: planeMatrix,
        planeWidth: planeWidth,
        planeHeight: planeHeight
    };

}
}

export { VolumeSequence }