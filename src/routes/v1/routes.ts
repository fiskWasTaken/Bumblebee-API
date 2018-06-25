import { Router, Request, Response } from 'express';
import express from 'express';
import passport from 'passport';
import { UserController } from './controllers/user.controller'
import { AuthenticationController } from './controllers/authentication.controller';
import { SourceController } from './controllers/source.controller';
import { WordController } from './controllers/word.controller';
import { FragmentController } from './controllers/fragment.controller';
import { AudioController } from './controllers/audio.controller';
import path from 'path';


const router: Router = Router();
const authenticationController = new AuthenticationController();
const userController = new UserController();
const sourceController = new SourceController();
const wordController = new WordController();
const fragmentController = new FragmentController();
const audioController = new AudioController();

const version : string = "/v1";

// Authentication and the like
router.post(version + '/login', authenticationController.login);
router.post(version + '/register', authenticationController.register);

// User
router.get(version + '/user', passport.authenticate('jwt', { session: true }), userController.getAll);
router.get(version + '/user/:id', passport.authenticate('jwt', { session: true }), userController.getByID);
router.patch(version + '/user/:id', passport.authenticate('jwt', { session: true }), userController.updateByID);
router.post(version + '/user', passport.authenticate('jwt', { session: true }), userController.create);
router.delete(version + '/user/:id', passport.authenticate('jwt', { session: true }), userController.deleteByID);
router.get(version + '/user/:id/sources', passport.authenticate('jwt', { session: true }), userController.getAllSourcesByUserID);

// Sources
router.get(version + '/source', passport.authenticate('jwt', {session: true}), sourceController.getAll);
router.get(version + '/source/:id', passport.authenticate('jwt', {session: true}), sourceController.getByID);
router.patch(version + '/source/:id', passport.authenticate('jwt', {session: true}), sourceController.updateByID);
router.post(version + '/source/', passport.authenticate('jwt', {session: true}), sourceController.create);
router.delete(version + '/source/:id', passport.authenticate('jwt', {session: true}), sourceController.deleteByID);

// Word
router.get(version + '/word', passport.authenticate('jwt', {session: true}), wordController.getAll);
router.get(version + '/word/:id', passport.authenticate('jwt', {session: true}), wordController.getByID);
router.patch(version + '/word/:id', passport.authenticate('jwt', {session: true}), wordController.updateByID);
router.post(version + '/word/', passport.authenticate('jwt', {session: true}), wordController.create);
router.delete(version + '/word/:id', passport.authenticate('jwt', {session: true}), wordController.deleteByID);

// Fragment
router.get(version + '/fragment', passport.authenticate('jwt', {session: true}), fragmentController.getAll);
router.get(version + '/fragment/:id', passport.authenticate('jwt', {session: true}), fragmentController.getByID);
router.patch(version + '/fragment/:id', passport.authenticate('jwt', {session: true}), fragmentController.updateByID);
router.post(version + '/fragment/', passport.authenticate('jwt', {session: true}), fragmentController.create);
router.delete(version + '/fragment/:id', passport.authenticate('jwt', {session: true}), fragmentController.deleteByID);

// Audio
router.post(version + '/audio/download', passport.authenticate('jwt', {session: true}), audioController.download)
router.use(version + '/audio/youtube', express.static(path.join(__dirname, '../../audio/youtube')));


export const routes: Router = router;
