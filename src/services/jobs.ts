import q from 'q';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ytdl from 'ytdl-core';
import { Source, ISource } from '../database/schemas/source';
import AudioService from './audio';
import YouTubeService from './youtube';



class JobService {

    extension: string = ".mp3";

    sourceQueue : ISource[];
    finishedQueue : boolean = false;

    public constructor() {
        this.sourceQueue = [];
    }


    public async handleMissingYoutubeFiles(){
        console.log("Run this stuff async like a boss?");
        console.log(AudioService);

        // Retrieve all sources
        Source.find({origin: 'YouTube'}).then((sources : ISource[] ) => {
            console.log("Got all sources bitches");
            this.sourceQueue = sources;
            // 5 runners
            this.parseItem();
            this.parseItem();
            this.parseItem();
            this.parseItem();
            this.parseItem();
        });

    }

    // private startQueue() : Promise{
    //     return new Promise((resolve,reject) => {

    //     })
    // }

    private parseItem(){
        let vm = this;
        
        if(this.sourceQueue != null && this.sourceQueue.length > 0){
            if(this.sourceQueue.length % 10 == 0){
                console.log("Parsing item " + this.sourceQueue.length + " left");
            }
            let source = this.sourceQueue.pop() as ISource;
            let yturl = "https://www.youtube.com/watch?v=" + source.id.toString();
            let creator = source.createdBy ? source.createdBy.toString() : '';
            YouTubeService.download(yturl, creator).then(() => {
                vm.parseItem();
            }, err => {
                console.log("Something failed, lets try again!");
                vm.parseItem();
            })
        }else{
            if(!this.finishedQueue){
                this.finishedQueue = true;
                console.log("Finished queue");
            }
            
        }

    }



}

export default new JobService();
